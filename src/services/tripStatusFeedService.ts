/**
 * Realtime Database Trip Status Feed Service for Portal B2B.
 *
 * Listens to `tripStatusFeed` filtered by companyId directly via WebSocket.
 * No polling, no unauthenticated endpoints.
 */

import {
  ref,
  onValue,
  query,
  orderByChild,
  equalTo,
  Unsubscribe,
} from "firebase/database";
import { rtdb } from "../lib/firebase";
import { TripStatusFeedEntry } from "../lib/tripStatus";

export type TripStatusFeedMap = Record<string, TripStatusFeedEntry>;

/**
 * Subscribes in real time to the company's trips in `tripStatusFeed`.
 */
export function subscribeToCompanyTripFeed(
  companyId: string,
  onUpdate: (feedMap: TripStatusFeedMap) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!companyId) {
    onUpdate({});
    return () => {};
  }

  const feedQuery = query(
    ref(rtdb, "tripStatusFeed"),
    orderByChild("companyId"),
    equalTo(companyId)
  );

  return onValue(
    feedQuery,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Record<string, TripStatusFeedEntry>;
        onUpdate(val || {});
      } else {
        onUpdate({});
      }
    },
    (err) => {
      console.warn(`[subscribeToCompanyTripFeed] Error for company ${companyId}:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribes to a specific ride in `rideRequests/{rideId}` for telemetry and driver details.
 */
export function subscribeToRideRequest(
  rideId: string,
  onUpdate: (rideData: Record<string, any> | null) => void
): Unsubscribe {
  const rideRef = ref(rtdb, `rideRequests/${rideId}`);
  return onValue(
    rideRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.val());
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn(`[subscribeToRideRequest] Error on ${rideId}:`, err);
    }
  );
}
