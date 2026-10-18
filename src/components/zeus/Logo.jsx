import React from "react";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

export default function Logo({ size = 34, withWordmark = true, withTagline = false, className = "" }) {
  if (withWordmark) {
    return (
      <img
        src={ZEUS_IMAGES.logoFull}
        onError={withImageFallback}
        alt="ZEUS"
        className={className}
        style={{ height: size, width: "auto" }}
      />
    );
  }
  return (
    <img
      src={ZEUS_IMAGES.logoIcon}
      onError={withImageFallback}
      alt="ZEUS"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
