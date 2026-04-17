import { CellValue } from "../../ui/CellValue";

type Props = {
  value: unknown;
  cqlType?: string;
  showEmptyMarker?: boolean;
};

export function TableValueDisplay({ value, cqlType, showEmptyMarker = false }: Props) {
  return <CellValue value={value} cqlType={cqlType} showEmptyMarker={showEmptyMarker} />;
}

