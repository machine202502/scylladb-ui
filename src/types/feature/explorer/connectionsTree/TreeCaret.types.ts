import type { ButtonHTMLAttributes } from "react";

export type TreeCaretProps = {
  open: boolean;
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children">;
