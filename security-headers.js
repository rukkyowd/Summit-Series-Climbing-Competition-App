const isProduction = process.env.NODE_ENV === "production";

function buildContentSecurityPolicy() {
  const directives = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["font-src", ["'self'", "data:"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'", "data:", "blob:", "https:"]],
    [
      "connect-src",
      [
        "'self'",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://vitals.vercel-insights.com",
        "https://va.vercel-scripts.com",
      ],
    ],
    ["object-src", ["'none'"]],
    [
      "script-src",
      ["'self'", "'unsafe-inline'", "https://va.vercel-scripts.com", ...(isProduction ? [] : ["'unsafe-eval'"])],
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["worker-src", ["'self'", "blob:"]],
  ];

  if (isProduction) {
    directives.push(["upgrade-insecure-requests", []]);
  }

  return directives.map(([name, values]) => `${name}${values.length ? ` ${values.join(" ")}` : ""}`).join("; ");
}

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy(),
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "Origin-Agent-Cluster",
    value: "?1",
  },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(self), usb=(), xr-spatial-tracking=()",
  },
  {
    key: "Referrer-Policy",
    value: "no-referrer",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Download-Options",
    value: "noopen",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
];

if (isProduction) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  });
}

module.exports = {
  securityHeaders,
};
