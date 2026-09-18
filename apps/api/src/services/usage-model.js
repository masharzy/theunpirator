const meteredDefinitions = [
  {
    key: "playback_minutes",
    label: "Playback minutes",
    unit: "minutes",
    limitKey: "monthly_playback_minutes",
    requiresObserved: true,
  },
  {
    key: "egress_bytes",
    label: "Recorded protected delivery",
    unit: "bytes",
    limitKey: "monthly_egress_bytes",
    requiresObserved: true,
  },
  {
    key: "playback_sessions",
    label: "Playback sessions",
    unit: "count",
    limitKey: "monthly_playback_sessions",
  },
  {
    key: "gateway_requests",
    label: "Gateway requests",
    unit: "count",
    limitKey: "monthly_gateway_requests",
  },
];

function normalizeLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function usageItem({ key, label, unit, used = 0, limit = null }) {
  const numericUsed = Math.max(0, Number(used || 0));
  const numericLimit = normalizeLimit(limit);
  const capped = numericLimit !== null;
  const pressure = !capped
    ? null
    : numericLimit === 0
      ? numericUsed > 0
        ? Infinity
        : 0
      : numericUsed / numericLimit;
  const percent = pressure === null ? null : Math.min(100, Math.max(0, pressure * 100));
  const exceeded = capped && numericUsed > numericLimit;
  const status = !capped
    ? "uncapped"
    : exceeded
      ? "exceeded"
      : pressure >= 0.8
        ? "near_limit"
        : "ok";

  return {
    key,
    label,
    unit,
    used: numericUsed,
    limit: numericLimit,
    capped,
    percent,
    remaining: capped ? Math.max(0, numericLimit - numericUsed) : null,
    exceeded,
    status,
    pressure,
  };
}

export function buildUsageModel({ metrics = {}, entitlements = {}, counts = {} }) {
  const metered = meteredDefinitions
    .filter((definition) => {
      const observed = Object.prototype.hasOwnProperty.call(metrics, definition.key);
      if (definition.requiresObserved) return observed;
      return observed || normalizeLimit(entitlements[definition.limitKey]) !== null;
    })
    .map((definition) =>
      usageItem({
        ...definition,
        used: metrics[definition.key] || 0,
        limit: entitlements[definition.limitKey],
      }),
    );

  const resources = [
    usageItem({
      key: "sites",
      label: "Sites",
      unit: "count",
      used: counts.sites || 0,
      limit: entitlements.max_sites,
    }),
    usageItem({
      key: "assets",
      label: "Assets / videos",
      unit: "count",
      used: counts.assets || 0,
      limit: entitlements.max_assets,
    }),
  ];

  const concurrentStreams = usageItem({
    key: "concurrent_streams",
    label: "Concurrent streams",
    unit: "count",
    used: counts.activeSessions || 0,
    limit: entitlements.max_concurrent_streams,
  });
  const deviceLimit = normalizeLimit(entitlements.max_devices_per_user);
  const live = [
    concurrentStreams,
    {
      key: "devices_per_viewer",
      label: "Devices per viewer",
      unit: "count",
      used: null,
      limit: deviceLimit,
      capped: deviceLimit !== null,
      percent: null,
      remaining: null,
      exceeded: false,
      status: deviceLimit === null ? "uncapped" : "configured",
      pressure: null,
    },
  ];

  const cappedMetered = metered.filter((item) => item.capped);
  const mostConstrained = cappedMetered.reduce((selected, item) => {
    if (!selected) return item;
    return (item.pressure ?? -1) > (selected.pressure ?? -1) ? item : selected;
  }, null);

  const headline = mostConstrained
    ? {
        status: mostConstrained.status,
        key: mostConstrained.key,
        label: mostConstrained.label,
        used: mostConstrained.used,
        limit: mostConstrained.limit,
        unit: mostConstrained.unit,
        percent: mostConstrained.percent,
        exceeded: mostConstrained.exceeded,
      }
    : {
        status: "uncapped",
        key: null,
        label: "No metered cap",
        used: null,
        limit: null,
        unit: null,
        percent: null,
        exceeded: false,
      };

  return { headline, metered, resources, live };
}
