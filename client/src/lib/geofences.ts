import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon, Feature, Polygon } from '@turf/helpers';

export interface Geofence {
  name: string;
  coordinates: [number, number][];
}

// Hardcoded legacy geofences removed — system now uses database-driven custom geofences only.
export const GEOFENCES: Record<string, Geofence> = {};

export const GEOFENCE_NAMES = Object.keys(GEOFENCES);

const geofencePolygons: Record<string, Feature<Polygon>> = {};

function getPolygon(neighborhoodName: string): Feature<Polygon> | null {
  if (geofencePolygons[neighborhoodName]) return geofencePolygons[neighborhoodName];
  const fence = GEOFENCES[neighborhoodName];
  if (!fence) return null;
  const poly = polygon([fence.coordinates]);
  geofencePolygons[neighborhoodName] = poly;
  return poly;
}

export function isPointInsideGeofence(lng: number, lat: number, neighborhoodName: string): boolean {
  const poly = getPolygon(neighborhoodName);
  if (!poly) return true;
  return booleanPointInPolygon(point([lng, lat]), poly);
}

export function isPointInsidePolygon(lng: number, lat: number, coordinates: [number, number][]): boolean {
  try {
    if (!coordinates || coordinates.length < 3) return true;
    const poly = polygon([coordinates]);
    return booleanPointInPolygon(point([lng, lat]), poly);
  } catch {
    return true;
  }
}

export function extractPolygonFromGeoJSON(geojsonText: string): { coordinates: [number, number][]; error?: never } | { error: string; coordinates?: never } {
  try {
    const geojson = JSON.parse(geojsonText);
    let coords: any = null;
    if (geojson.type === 'FeatureCollection' && geojson.features?.length > 0) {
      const feature = geojson.features[0];
      coords = feature?.geometry?.coordinates?.[0];
    } else if (geojson.type === 'Feature') {
      coords = geojson?.geometry?.coordinates?.[0];
    } else if (geojson.type === 'Polygon') {
      coords = geojson?.coordinates?.[0];
    }
    if (!coords || !Array.isArray(coords) || coords.length < 3) {
      return { error: 'GeoJSON inválido: não foi possível extrair um polígono. Verifique se contém uma Feature do tipo Polygon.' };
    }
    return { coordinates: coords as [number, number][] };
  } catch {
    return { error: 'JSON inválido. Verifique o texto colado.' };
  }
}
