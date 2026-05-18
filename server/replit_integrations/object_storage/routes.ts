import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { getObjectAclPolicy, ObjectPermission } from "./objectAcl";
import { isAuthenticated, getResolvedUserId } from "../auth";
import { storage } from "../../storage";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
  "image/bmp",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/mpeg",
  "application/pdf",
  "application/octet-stream",
]);

function isAllowedContentType(contentType: string | undefined): boolean {
  if (!contentType) return true;
  const base = contentType.split(";")[0].trim().toLowerCase();
  if (ALLOWED_CONTENT_TYPES.has(base)) return true;
  if (base.startsWith("image/") || base.startsWith("audio/") || base.startsWith("video/")) return true;
  return false;
}

/**
 * Extract the object UUID from a normalized path like /objects/uploads/<uuid>.
 * Returns undefined if the path structure is unexpected.
 */
function extractObjectId(objectPath: string): string | undefined {
  const parts = objectPath.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  return parts[parts.length - 1];
}

/**
 * Resolve the caller's internal user ID from either a native session or
 * a Replit OIDC session. Returns undefined if the caller is not authenticated.
 */
async function resolveAuthenticatedUserId(req: any): Promise<string | undefined> {
  // Native session (email/password auth stores userId directly on the session)
  if (req.session?.userId) {
    return req.session.userId as string;
  }
  // Replit OIDC session — getResolvedUserId handles internal-ID resolution
  try {
    return await getResolvedUserId(req);
  } catch {
    return undefined;
  }
}

/**
 * Register object storage routes for file uploads.
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Requires authentication (both native and OIDC sessions).
   * Only allows safe content types (images, audio, video, PDF).
   * Accepts an optional orgId to associate the upload with an organization for
   * tenant-level access control at download time.  The caller must be a member
   * of any orgId they supply.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg",
   *   "orgId": 42          // optional — links the file to an org
   * }
   *
   * Ownership is recorded synchronously; if it fails the request fails so
   * that the signed URL is never returned without a corresponding record.
   */
  app.post("/api/uploads/request-url", isAuthenticated, async (req, res) => {
    try {
      const { name, size, contentType, orgId } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      if (!isAllowedContentType(contentType)) {
        return res.status(400).json({ error: "Content type not allowed" });
      }

      const userId = await resolveAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Validate supplied orgId: caller must be a member
      let resolvedOrgId: number | undefined;
      if (orgId !== undefined && orgId !== null && orgId !== "") {
        const parsedOrgId = Number(orgId);
        if (!isNaN(parsedOrgId) && parsedOrgId > 0) {
          const isMember = await storage.isUserMemberOfOrg(userId, parsedOrgId);
          if (!isMember) {
            return res.status(403).json({ error: "Not a member of the specified organization" });
          }
          resolvedOrgId = parsedOrgId;
        }
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      // Record ownership synchronously so the download route can enforce
      // deny-by-default access control. Failure is surfaced to the client
      // to avoid orphaned uploads that would be permanently inaccessible.
      const objectId = extractObjectId(objectPath);
      if (!objectId) {
        return res.status(500).json({ error: "Failed to determine object identifier" });
      }
      await storage.createUploadOwnership(objectId, userId, resolvedOrgId);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * Access control (evaluated in order):
   * 1. Objects with explicit ACL visibility "public" → serve without auth.
   * 2. Objects with explicit ACL (private) → require auth AND pass
   *    canAccessObjectEntity() (owner / ACL-rule match); 403 if denied.
   * 3. Objects with no ACL metadata → require auth AND consult the
   *    upload_ownership table:
   *    - allow if requester is the direct uploader (userId match)
   *    - allow if requester is a member of the owning organization
   *    - 403 if no ownership record exists (predates this fix or uploaded
   *      outside the normal flow — denied by default)
   *
   * All responses include X-Content-Type-Options: nosniff and dangerous
   * content types are forced to attachment to block inline browser execution.
   */
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      const aclPolicy = await getObjectAclPolicy(objectFile);
      const isPublic = aclPolicy?.visibility === "public";

      // Case 1: explicitly public — serve to anyone
      if (isPublic) {
        await objectStorageService.downloadObject(objectFile, res);
        return;
      }

      // All other objects require authentication (supports native + OIDC sessions)
      const userId = await resolveAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Case 2: explicit ACL policy present — enforce via ACL engine
      if (aclPolicy) {
        const allowed = await objectStorageService.canAccessObjectEntity({
          userId,
          objectFile,
          requestedPermission: ObjectPermission.READ,
        });
        if (!allowed) {
          return res.status(403).json({ error: "Forbidden" });
        }
        await objectStorageService.downloadObject(objectFile, res);
        return;
      }

      // Case 3: no ACL metadata — fall back to upload ownership table (deny-by-default)
      const objectId = extractObjectId(req.path);
      if (!objectId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const ownership = await storage.getUploadOwnership(objectId);
      if (!ownership) {
        // No ownership record: predates this fix or uploaded outside normal flow.
        return res.status(403).json({ error: "Forbidden" });
      }

      // Allow the direct uploader
      if (ownership.userId === userId) {
        await objectStorageService.downloadObject(objectFile, res);
        return;
      }

      // Allow any member of the owning organization
      if (ownership.organizationId) {
        const isMember = await storage.isUserMemberOfOrg(userId, ownership.organizationId);
        if (isMember) {
          await objectStorageService.downloadObject(objectFile, res);
          return;
        }
      }

      return res.status(403).json({ error: "Forbidden" });
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
