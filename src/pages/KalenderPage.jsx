import React from "react";
import { TagesberichtePage } from "./TagesberichtePage";

export function KalenderPage(props) {
  return <TagesberichtePage {...props} initialView="calendar" />;
}
