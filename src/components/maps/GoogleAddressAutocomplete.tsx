"use client";

import React, { useEffect, useRef, useState } from "react";
import { loadGoogleMapsScript } from "@/lib/googleMaps";
import { MapPin, X, Loader2 } from "lucide-react";

export interface AddressSelection {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
  name?: string;
  isVerified?: boolean;
}

interface Props {
  value: string;
  isVerified?: boolean;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (selection: AddressSelection) => void;
  className?: string;
}

export default function GoogleAddressAutocomplete({
  value,
  isVerified,
  placeholder = "Buscar dirección o punto de referencia en El Salvador...",
  label,
  required = false,
  disabled = false,
  onChange,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [inputValue, setInputValue] = useState(value || "");
  const [confirmed, setConfirmed] = useState<boolean>(
    isVerified !== undefined ? isVerified : Boolean(value && value.trim())
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    if (isVerified !== undefined) {
      setConfirmed(isVerified);
    }
  }, [isVerified]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    loadGoogleMapsScript()
      .then((g) => {
        if (!active || !inputRef.current) return;
        setIsLoading(false);

        // Crear Autocomplete con restricción a El Salvador (SV)
        const autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "sv" },
          fields: ["formatted_address", "geometry", "name", "place_id"],
        });

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place || !place.geometry || !place.geometry.location) {
            return;
          }

          const selectedAddress =
            place.formatted_address || place.name || inputRef.current?.value || "";
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          setInputValue(selectedAddress);
          setConfirmed(true);
          onChangeRef.current({
            address: selectedAddress,
            lat,
            lng,
            placeId: place.place_id,
            name: place.name,
            isVerified: true,
          });
        });

        autocompleteRef.current = autocomplete;
      })
      .catch((err) => {
        if (active) {
          console.warn("[GoogleAddressAutocomplete] Fallback local:", err);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      if (autocompleteRef.current && window.google?.maps?.event) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setInputValue(newVal);
    setConfirmed(false);
    onChangeRef.current({
      address: newVal,
      lat: 0,
      lng: 0,
      isVerified: false,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Evitar que presionar Enter al elegir una sugerencia de Google Places envíe el formulario
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleClear = () => {
    setInputValue("");
    setConfirmed(false);
    if (inputRef.current) inputRef.current.value = "";
    onChangeRef.current({
      address: "",
      lat: 0,
      lng: 0,
      isVerified: false,
    });
  };

  const showUnverifiedWarning = Boolean(inputValue.trim().length > 0 && !confirmed);

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-[#2A3547]">
          {label} {required && <span className="text-[#FA896B]">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <MapPin
          className={`w-4 h-4 absolute left-3 pointer-events-none ${
            showUnverifiedWarning ? "text-[#D97706]" : "text-[#5D87FF]"
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`w-full pl-9 pr-9 py-2 text-xs rounded-[7px] border focus:outline-none focus:ring-1 text-[#2A3547] placeholder-[#7C8FAC] bg-white transition disabled:bg-gray-50 ${
            showUnverifiedWarning
              ? "border-[#FFAE1F] focus:border-[#D97706] focus:ring-[#FFAE1F]"
              : "border-[#DFE5EF] focus:border-[#5D87FF] focus:ring-[#5D87FF]"
          }`}
        />
        {isLoading && (
          <Loader2 className="w-4 h-4 text-[#7C8FAC] absolute right-3 animate-spin pointer-events-none" />
        )}
        {!isLoading && inputValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 p-1 text-[#7C8FAC] hover:text-[#2A3547] rounded-full"
            title="Borrar dirección"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {showUnverifiedWarning && (
        <p className="text-[11px] font-medium text-[#D97706]">
          Selecciona una sugerencia de la lista desplegable de Google Maps para validar la dirección.
        </p>
      )}
    </div>
  );
}
