import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapContainer, TileLayer, GeoJSON, Tooltip } from "react-leaflet";
import { Map, BarChart2, Info } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface CityData {
  city: string;
  surveys: Array<{ id: number; title: string; status: string; responses: number; target: number }>;
  leadingOption: string | null;
  leadingPct: number;
}

const CANDIDATE_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#ea580c", "#4f46e5"
];

export default function StateMapPage({ params }: { params: { orgId: string } }) {
  const orgId = parseInt(params.orgId);

  const { data: cityData = [], isLoading: dataLoading } = useQuery<CityData[]>({
    queryKey: ['/api/organizations', orgId, 'state-map-data'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/state-map-data`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [geojson, setGeojson] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<CityData | null>(null);

  useEffect(() => {
    fetch("https://servicodados.ibge.gov.br/api/v3/malhas/estados/32/municipios?formato=application/vnd.geo+json&resolucao=5")
      .then(r => r.json())
      .then(data => { setGeojson(data); setGeoLoading(false); })
      .catch(() => setGeoLoading(false));
  }, []);

  // Build candidate color map
  const candidateColorMap: Record<string, string> = {};
  let colorIdx = 0;
  cityData.forEach(c => {
    if (c.leadingOption && !candidateColorMap[c.leadingOption]) {
      candidateColorMap[c.leadingOption] = CANDIDATE_COLORS[colorIdx++ % CANDIDATE_COLORS.length];
    }
  });

  // Normalize city names for matching (IBGE uses uppercase accented names)
  const normalize = (s: string) =>
    s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const cityDataByName: Record<string, CityData> = {};
  cityData.forEach(c => { cityDataByName[normalize(c.city)] = c; });

  function getFeatureStyle(feature: any) {
    const name = feature?.properties?.NM_MUN || feature?.properties?.name || '';
    const normalized = normalize(name);
    const data = cityDataByName[normalized];

    if (!data || !data.leadingOption) {
      return {
        fillColor: '#e2e8f0',
        weight: 1,
        opacity: 0.7,
        color: '#94a3b8',
        fillOpacity: 0.6,
      };
    }

    const baseColor = candidateColorMap[data.leadingOption] || '#2563eb';
    const intensity = Math.min(0.9, 0.3 + (data.leadingPct / 100) * 0.6);
    return {
      fillColor: baseColor,
      weight: 1.5,
      opacity: 0.9,
      color: '#fff',
      fillOpacity: intensity,
    };
  }

  function onEachFeature(feature: any, layer: any) {
    const name = feature?.properties?.NM_MUN || feature?.properties?.name || '';
    const normalized = normalize(name);
    const data = cityDataByName[normalized];

    layer.on({
      mouseover: (e: any) => {
        e.target.setStyle({ weight: 2.5, color: '#1e3a5f', fillOpacity: 0.9 });
      },
      mouseout: (e: any) => {
        e.target.setStyle(getFeatureStyle(feature));
      },
      click: () => {
        setSelectedCity(data || null);
      },
    });

    const tooltipContent = data
      ? `<strong>${name}</strong><br/>
         Candidato líder: <strong>${data.leadingOption || '-'}</strong> (${data.leadingPct}%)<br/>
         ${data.surveys.length} pesquisa(s)`
      : `<strong>${name}</strong><br/><em>Sem dados</em>`;

    layer.bindTooltip(tooltipContent, { sticky: true });
  }

  const uniqueCandidates = Object.entries(candidateColorMap);
  const totalCities = cityData.length;
  const activeCities = cityData.filter(c => c.surveys.some(s => s.status === 'active')).length;

  return (
    <DashboardLayout orgId={orgId.toString()}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Map className="w-6 h-6 text-primary" />
              Mapa do Estado — ES
            </h1>
            <p className="text-muted-foreground mt-1">
              Visualização coroplética por município com candidato líder por pesquisa.
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Municípios com dados</p>
              <p className="text-2xl font-bold mt-1" data-testid="text-total-cities">{totalCities}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Com pesquisa ativa</p>
              <p className="text-2xl font-bold mt-1 text-green-600" data-testid="text-active-cities">{activeCities}</p>
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Legenda — Candidatos</p>
              {uniqueCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {uniqueCandidates.map(([name, color]) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Mapa Coroplético — Espírito Santo</CardTitle>
              <CardDescription>
                Clique em um município para ver detalhes. Intensidade da cor indica % do candidato líder.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {geoLoading || dataLoading ? (
                <div className="flex items-center justify-center h-[450px] text-muted-foreground">
                  <div className="text-center">
                    <Map className="w-10 h-10 mx-auto mb-2 animate-pulse opacity-50" />
                    <p>Carregando mapa...</p>
                  </div>
                </div>
              ) : (
                <div className="h-[450px] rounded-b-lg overflow-hidden" data-testid="div-state-map">
                  <MapContainer
                    center={[-20.3155, -40.3128]}
                    zoom={7}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    {geojson && (
                      <GeoJSON
                        key={cityData.length}
                        data={geojson}
                        style={getFeatureStyle}
                        onEachFeature={onEachFeature}
                      />
                    )}
                  </MapContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4" />
                {selectedCity ? selectedCity.city : "Selecione um município"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedCity ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Map className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Clique em um município no mapa para ver as pesquisas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedCity.leadingOption && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs text-muted-foreground mb-1">Candidato líder</p>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-lg">{selectedCity.leadingOption}</span>
                        <Badge className="text-base px-3">{selectedCity.leadingPct}%</Badge>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-semibold mb-2">Pesquisas neste município:</p>
                    <div className="space-y-2">
                      {selectedCity.surveys.map(s => (
                        <div key={s.id} className="p-2 border rounded text-sm">
                          <p className="font-medium truncate">{s.title}</p>
                          <div className="flex items-center justify-between mt-1">
                            <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {s.status === 'active' ? 'Ativa' : s.status === 'completed' ? 'Concluída' : s.status}
                            </Badge>
                            <span className="text-muted-foreground">
                              {s.responses}/{s.target || '?'}
                            </span>
                          </div>
                          {s.target > 0 && (
                            <div className="mt-1 bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.min(100, (s.responses / s.target) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* City table */}
        {cityData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart2 className="w-4 h-4" />
                Resumo por Município
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Município</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Candidato Líder</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">%</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">Pesquisas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityData.sort((a, b) => b.leadingPct - a.leadingPct).map((c) => (
                      <tr
                        key={c.city}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedCity(c)}
                        data-testid={`row-city-${c.city.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <td className="py-2 px-2 font-medium">{c.city}</td>
                        <td className="py-2 px-2">
                          {c.leadingOption ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: candidateColorMap[c.leadingOption] || '#94a3b8' }}
                              />
                              {c.leadingOption}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-bold">
                          {c.leadingPct > 0 ? `${c.leadingPct}%` : '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{c.surveys.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
