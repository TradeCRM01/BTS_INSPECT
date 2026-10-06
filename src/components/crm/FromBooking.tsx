export function FromBooking({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="hub-schedule-from-booking">From your booking</span>;
}
