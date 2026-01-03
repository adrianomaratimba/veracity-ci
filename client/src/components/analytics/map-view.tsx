import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { type Response } from "@shared/schema";
import { useEffect, useMemo } from "react";
import L from "leaflet";

interface MapViewProps {
  responses: Response[];
  height?: string;
}

function MapBounds({ responses }: { responses: Response[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (responses.length > 0) {
      const bounds = L.latLngBounds(
        responses.map(r => [r.latitude, r.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [responses, map]);
  
  return null;
}

const statusColors: Record<string, string> = {
  valid: '#22c55e',
  suspicious: '#f59e0b',
  invalid: '#ef4444',
};

const statusLabels: Record<string, string> = {
  valid: 'Válida',
  suspicious: 'Suspeita',
  invalid: 'Inválida',
};

export function MapView({ responses, height = "400px" }: MapViewProps) {
  const center: [number, number] = useMemo(() => {
    if (responses.length === 0) return [-14.2350, -51.9253];
    const lat = responses.reduce((sum, r) => sum + r.latitude, 0) / responses.length;
    const lng = responses.reduce((sum, r) => sum + r.longitude, 0) / responses.length;
    return [lat, lng];
  }, [responses]);

  const stats = useMemo(() => ({
    valid: responses.filter(r => r.status === 'valid').length,
    suspicious: responses.filter(r => r.status === 'suspicious').length,
    invalid: responses.filter(r => r.status === 'invalid').length,
  }), [responses]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Válidas ({stats.valid})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span>Suspeitas ({stats.suspicious})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Inválidas ({stats.invalid})</span>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden border shadow-sm" style={{ height }}>
        <MapContainer 
          center={center} 
          zoom={responses.length > 0 ? 12 : 4} 
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBounds responses={responses} />
          {responses.map((resp) => (
            <CircleMarker 
              key={resp.id} 
              center={[resp.latitude, resp.longitude]}
              radius={8}
              pathOptions={{
                fillColor: statusColors[resp.status] || '#6b7280',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8,
              }}
            >
              <Popup>
                <div className="text-sm space-y-1">
                  <p className="font-semibold">Entrevista #{resp.id}</p>
                  <p>
                    <span className="text-muted-foreground">Status: </span>
                    <span style={{ color: statusColors[resp.status] }}>
                      {statusLabels[resp.status] || resp.status}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Precisão GPS: </span>
                    {resp.accuracy?.toFixed(1)}m
                  </p>
                  <p>
                    <span className="text-muted-foreground">Data: </span>
                    {resp.createdAt ? new Date(resp.createdAt).toLocaleString('pt-BR') : '-'}
                  </p>
                  {resp.flagReason && (
                    <p className="text-amber-600 text-xs mt-1">
                      {resp.flagReason}
                    </p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
