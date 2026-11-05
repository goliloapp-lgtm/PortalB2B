"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SV_CENTER,
  loadGoogleMapsScript,
  RoutePointCoord,
} from "@/lib/googleMaps";
import { MapPin, Navigation, Clock, ShieldCheck, Loader2 } from "lucide-react";

interface Props {
  origin: RoutePointCoord;
  destination: RoutePointCoord;
  stops?: RoutePointCoord[];
  roundTrip?: boolean;
  distanceKm?: number;
  durationMinutes?: number;
  onRouteCalculated?: (result: {
    distanceKm: number;
    durationMinutes: number;
    directionsResult: google.maps.DirectionsResult;
  }) => void;
  height?: string;
  className?: string;
}

export default function GoogleRouteMap({
  origin,
  destination,
  stops = [],
  roundTrip = false,
  distanceKm,
  durationMinutes,
  onRouteCalculated,
  height = "320px",
  className = "",
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const [loadingMap, setLoadingMap] = useState(true);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [liveDistanceKm, setLiveDistanceKm] = useState<number | null>(
    distanceKm ?? null
  );
  const [liveDurationMin, setLiveDurationMin] = useState<number | null>(
    durationMinutes ?? null
  );

  // Inicializar Google Map
  useEffect(() => {
    let active = true;

    loadGoogleMapsScript()
      .then((g) => {
        if (!active || !mapContainerRef.current) return;

        if (!mapRef.current) {
          const mapInstance = new g.maps.Map(mapContainerRef.current, {
            center: DEFAULT_SV_CENTER,
            zoom: 12,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }],
              },
            ],
          });

          const directionsRenderer = new g.maps.DirectionsRenderer({
            map: mapInstance,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: "#5D87FF",
              strokeWeight: 5,
              strokeOpacity: 0.85,
            },
          });

          mapRef.current = mapInstance;
          directionsRendererRef.current = directionsRenderer;
        }

        setLoadingMap(false);
      })
      .catch((err) => {
        console.warn("[GoogleRouteMap] Error al inicializar mapa:", err);
        if (active) setLoadingMap(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Calcular ruta y trazar en el mapa cuando cambian origen, paradas o destino
  useEffect(() => {
    if (!window.google?.maps || !directionsRendererRef.current || !mapRef.current) {
      return;
    }

    if (!origin?.lat || !destination?.lat) {
      return;
    }

    let active = true;
    setCalculatingRoute(true);

    const g = window.google;
    const directionsService = new g.maps.DirectionsService();

    const waypoints: google.maps.DirectionsWaypoint[] = stops
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        location: { lat: s.lat, lng: s.lng },
        stopover: true,
      }));

    directionsService.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints,
        travelMode: g.maps.TravelMode.DRIVING,
        unitSystem: g.maps.UnitSystem.METRIC,
      },
      (result, status) => {
        if (!active) return;
        setCalculatingRoute(false);

        if (status === g.maps.DirectionsStatus.OK && result && result.routes[0]) {
          directionsRendererRef.current?.setDirections(result);

          // Calcular distancia y tiempo total de los tramos
          let totalMeters = 0;
          let totalSecs = 0;
          for (const leg of result.routes[0].legs) {
            totalMeters += leg.distance?.value || 0;
            totalSecs += leg.duration?.value || 0;
          }

          let km = Number((totalMeters / 1000).toFixed(1));
          let min = Math.max(5, Math.round(totalSecs / 60));

          if (roundTrip) {
            km = Number((km * 2).toFixed(1));
            min = Math.round(min * 2);
          }

          setLiveDistanceKm(km);
          setLiveDurationMin(min);

          if (onRouteCalculated) {
            onRouteCalculated({
              distanceKm: km,
              durationMinutes: min,
              directionsResult: result,
            });
          }
        } else {
          console.warn("[GoogleRouteMap] DirectionsService status:", status);
        }
      }
    );

    return () => {
      active = false;
    };
  }, [
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    stops,
    roundTrip,
    onRouteCalculated,
  ]);

  return (
    <div
      className={`relative rounded-[8px] overflow-hidden border border-[#DFE5EF] shadow-sm bg-[#F2F6FA] ${className}`}
      style={{ height }}
    >
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Loading state overlay */}
      {(loadingMap || calculatingRoute) && (
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-[6px] border border-[#DFE5EF] shadow-sm flex items-center space-x-2 text-xs font-semibold text-[#5A6A85]">
          <Loader2 className="w-3.5 h-3.5 text-[#5D87FF] animate-spin" />
          <span>
            {loadingMap ? "Cargando Google Maps..." : "Calculando ruta vial en SV..."}
          </span>
        </div>
      )}

      {/* Floating Route Info Badge */}
      {!loadingMap && liveDistanceKm !== null && liveDistanceKm > 0 && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-10 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-[8px] border border-[#DFE5EF] shadow-md flex items-center justify-between sm:justify-start sm:space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-full bg-[#ECF2FF] text-[#5D87FF] flex items-center justify-center">
              <Navigation className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[#7C8FAC] block leading-tight">
                Distancia Vial SV
              </span>
              <span className="text-sm font-extrabold text-[#2A3547]">
                {liveDistanceKm} km {roundTrip && "(Ida y Vuelta)"}
              </span>
            </div>
          </div>

          <div className="h-6 w-px bg-[#DFE5EF] hidden sm:block" />

          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-full bg-[#E6FFFA] text-[#13DEB9] flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[#7C8FAC] block leading-tight">
                Tiempo Estimado
              </span>
              <span className="text-sm font-extrabold text-[#2A3547]">
                ~{liveDurationMin} min
              </span>
            </div>
          </div>

          <div className="h-6 w-px bg-[#DFE5EF] hidden sm:block" />

          <div className="hidden sm:flex items-center space-x-1.5 text-[11px] text-[#13DEB9] font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Google Maps API Conectada</span>
          </div>
        </div>
      )}
    </div>
  );
}
