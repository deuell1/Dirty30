export function venueUpdatePayload(venue: { id: number; name: string; address: string }) {
  return { venueId: venue.id, data: { name: venue.name.trim(), address: venue.address.trim() } };
}

export function courtUpdatePayload(court: { id: number; name: string }) {
  return { courtId: court.id, data: { name: court.name.trim() } };
}