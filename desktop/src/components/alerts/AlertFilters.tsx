import { SegmentedControl, type SegmentOption } from '../common/SegmentedControl';
import type { AlertLevel, AlertMetric } from '../../services/api';
import type { AlertViewFilters, DateRange } from '../../context/AlertHistoryContext';
import { METRIC_LABELS } from './labels';

const RANGE_OPTIONS: SegmentOption<DateRange>[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

const METRIC_OPTIONS: SegmentOption<AlertMetric | 'all'>[] = [
  { value: 'all', label: 'All' },
  ...(Object.keys(METRIC_LABELS) as AlertMetric[]).map((metric) => ({ value: metric, label: METRIC_LABELS[metric] })),
];

const LEVEL_OPTIONS: SegmentOption<AlertLevel | 'all'>[] = [
  { value: 'all', label: 'All' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

interface AlertFiltersProps {
  filters: AlertViewFilters;
  onChange: (filters: AlertViewFilters) => void;
}

export function AlertFilters({ filters, onChange }: AlertFiltersProps) {
  return (
    <>
      <SegmentedControl
        options={RANGE_OPTIONS}
        value={filters.range}
        onChange={(range) => onChange({ ...filters, range })}
        ariaLabel="Date range"
      />
      {filters.range === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            aria-label="From"
            className="field"
            value={filters.customFrom}
            max={filters.customTo || undefined}
            onChange={(e) => onChange({ ...filters, customFrom: e.target.value })}
          />
          <span className="text-xs text-ink-faint">to</span>
          <input
            type="datetime-local"
            aria-label="To"
            className="field"
            value={filters.customTo}
            min={filters.customFrom || undefined}
            onChange={(e) => onChange({ ...filters, customTo: e.target.value })}
          />
        </div>
      )}
      <SegmentedControl
        options={METRIC_OPTIONS}
        value={filters.metric}
        onChange={(metric) => onChange({ ...filters, metric })}
        ariaLabel="Filter by alert type"
      />
      <SegmentedControl
        options={LEVEL_OPTIONS}
        value={filters.level}
        onChange={(level) => onChange({ ...filters, level })}
        ariaLabel="Filter by severity"
      />
    </>
  );
}
