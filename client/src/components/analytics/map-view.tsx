import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "leaflet";
import { type Response } from "@shared/schema";

// Fix Leaflet default icon issue in React
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Custom Icons could be added here for different statuses (valid/suspicious)

interface MapViewProps {
  responses: Response[];
  height?: string;
}

export function MapView({ responses, height = "400px" }: MapViewProps) {
  // Center map on the first response or default location (e.g., Brazil center)
  const center: [number, number] = responses.length > 0 
    ? [responses[0].latitude, responses[0].longitude] 
    : [-14.2350, -51.9253];

  return (
    <div className="rounded-xl overflow-hidden border shadow-sm" style={{ height }}>
      <MapContainer 
        center={center} 
        zoom={responses.length > 0 ? 12 : 4} 
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {responses.map((resp) => (
          <Marker 
            key={resp.id} 
            position={[resp.latitude, resp.longitude]}
          >
            <Popup>
              <div className="text-sm">
                <strong>Response #{resp.id}</strong><br />
                Status: {resp.status}<br />
                Accuracy: {resp.accuracy.toFixed(1)}m<br />
                Date: {new Date(resp.createdAt!).toLocaleString()}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
