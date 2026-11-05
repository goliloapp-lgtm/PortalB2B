"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SV_CENTER,
  loadGoogleMapsScript,
  RoutePointCoord,
} from "@/lib/googleMaps";
import { Navigation, Car, MapPin, Loader2, Compass } from "lucide-react";

interface Props {
  origin?: RoutePointCoord | null;
  destination?: RoutePointCoord | null;
  stops?: RoutePointCoord[];
  driverLocation?: {
    lat?: number;
    lng?: number;
    speed?: number;
    heading?: number;
    status?: string;
  } | null;
  driverName?: string;
  vehiclePlate?: string;
  height?: string;
  className?: string;
}

export default function GoogleTripTrackingMap({
  origin,
  destination,
  stops = [],
  driverLocation,
  driverName,
  vehiclePlate,
  height = "260px",
  className = "",
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);

  // Inicializar mapa
  useEffect(() => {
    let active = true;

    loadGoogleMapsScript()
      .then((g) => {
        if (!active || !mapContainerRef.current) return;

        if (!mapRef.current) {
          const center =
            origin?.lat && origin?.lng
              ? { lat: origin.lat, lng: origin.lng }
              : DEFAULT_SV_CENTER;

          const mapInstance = new g.maps.Map(mapContainerRef.current, {
            center,
            zoom: 13,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });

          const renderer = new g.maps.DirectionsRenderer({
            map: mapInstance,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: "#5D87FF",
              strokeWeight: 5,
              strokeOpacity: 0.85,
            },
          });

          mapRef.current = mapInstance;
          directionsRendererRef.current = renderer;
          setMapLoaded(true);
        }
      })
      .catch((err) => console.warn("[GoogleTripTrackingMap] Error loading map:", err));

    return () => {
      active = false;
    };
  }, []);

  // Trazar ruta planificada
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !directionsRendererRef.current) return;
    if (!origin?.lat || !destination?.lat) return;

    const g = window.google;
    if (!g) return;

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
      (res, status) => {
        if (status === g.maps.DirectionsStatus.OK && res) {
          directionsRendererRef.current?.setDirections(res);
        }
      }
    );
  }, [mapLoaded, origin?.lat, origin?.lng, destination?.lat, destination?.lng, stops]);

  // Actualizar marcador de conductor en tiempo real (RTDB)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const g = window.google;
    if (!g) return;

    if (driverLocation?.lat && driverLocation?.lng) {
      const pos = { lat: driverLocation.lat, lng: driverLocation.lng };

      if (!driverMarkerRef.current) {
        // Crear marcador con icono de vehículo
        driverMarkerRef.current = new g.maps.Marker({
          position: pos,
          map: mapRef.current,
          title: driverName ? `Conductor: ${driverName}` : "Conductor Lilo",
          icon: {
            path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#0D9488",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            rotation: driverLocation.heading || 0,
          },
        });
      } else {
        driverMarkerRef.current.setPosition(pos);
        if (driverLocation.heading !== undefined) {
          const icon = driverMarkerRef.current.getIcon() as google.maps.Symbol;
          if (icon && typeof icon === "object") {
            icon.rotation = driverLocation.heading;
            driverMarkerRef.current.setIcon(icon);
          }
        }
      }

      // Si no hay ruta trazada, centrar en el conductor
      if (!origin?.lat && !destination?.lat) {
        mapRef.current.panTo(pos);
      }
    } else {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setMap(null);
        driverMarkerRef.current = null;
      }
    }
  }, [mapLoaded, driverLocation?.lat, driverLocation?.lng, driverLocation?.heading, driverName]);

  return (
    <div
      className={`relative rounded-[8px] overflow-hidden border border-[#DFE5EF] shadow-sm bg-[#F2F6FA] ${className}`}
      style={{ height }}
    >
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Driver telemetry live pill */}
      {driverLocation?.lat && driverLocation?.lng && (
        <div className="absolute top-2 left-2 z-10 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-[6px] border border-[#13DEB9]/40 shadow-sm flex items-center space-x-2 text-xs font-semibold text-[#0D9488]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#13DEB9] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0D9488]"></span>
          </span>
          <span>
            {driverName || "Conductor"} · {vehiclePlate || "En ruta"}
            {driverLocation.speed !== undefined && ` (${driverLocation.speed} km/h)`}
          </span>
        </div>
      )}
    </div>
  );
}
