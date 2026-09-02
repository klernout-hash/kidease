import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Minus, Navigation, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { DaycareCard } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { mapZoomForRadius, openDirections, readMapBase, writeMapBase, type MapBase } from "@/lib/maps";
import {
  createListingOverlayFactory,
  createYouAreHereDot,
  googleMapTypeId,
  googleMapsMapId,
  GOOGLE_MAPS_BROWSER_ENV,
  hasGoogleMapsBrowserKey,
  listingMapConstructorOptions,
  loadAdvancedMarkerElement,
  loadGoogleMaps,
  type AdvancedMarkerCtor,
  type ListingOverlay,
  type MovableDot,
} from "@/lib/google-maps";
import { GoogleRating } from "@/components/google-rating";
import { BuildingPhoto } from "@/components/building-photo";
import { PriorityPill } from "@/components/priority-pill";
import { feeBadgeKey, licenseRecordUrl } from "@/lib/licensing";
