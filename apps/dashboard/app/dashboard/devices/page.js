import { CustomerRecordsPage } from "@/components/customer-records-page";
export default function DevicesPage() {
  return (
    <CustomerRecordsPage
      eyebrow="Playback identity"
      title="Devices"
      description="Every browser and device seen by protected playback, with its current access state."
      endpoint="/v1/security/devices"
      empty="No viewer devices recorded"
    />
  );
}
