import { memo } from 'react';
import { Area, AreaChart, Brush, ComposedChart, ResponsiveContainer } from 'recharts';
import type { ChartPoint } from '../../utils/series';

const STRIP_HEIGHT = 38;

export interface BrushRange {
  startIndex: number;
  endIndex: number;
}

interface OverviewStripProps {
  /** CPU over the whole loaded range */
  points: ChartPoint[];
  /** Where the window starts out. The strip is remounted (by key) to move it from outside. */
  initial: BrushRange;
  onChange: (range: BrushRange) => void;
}

/**
 * Focus and context: the whole loaded range in miniature, with a window on it.
 * Dragging the window pans the charts above, and pulling an edge zooms them.
 */
export const OverviewStrip = memo(function OverviewStrip({ points, initial, onChange }: OverviewStripProps) {
  return (
    <section className="panel shrink-0 px-5 pb-2.5 pt-2">
      <p className="caps">Overview: drag to move, pull the edges to zoom</p>
      <div className="mt-1.5" style={{ height: STRIP_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* The chart itself draws nothing. It exists to host the brush, which draws the miniature. */}
          <ComposedChart data={points} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Brush
              dataKey="t"
              height={STRIP_HEIGHT}
              startIndex={initial.startIndex}
              endIndex={initial.endIndex}
              travellerWidth={8}
              stroke="var(--ink-soft)"
              fill="var(--sunken)"
              tickFormatter={() => ''}
              onChange={({ startIndex, endIndex }) => {
                if (startIndex !== undefined && endIndex !== undefined) onChange({ startIndex, endIndex });
              }}
            >
              <AreaChart data={points}>
                <Area
                  dataKey="cpu_avg"
                  type="linear"
                  stroke="var(--ink-faint)"
                  strokeWidth={1}
                  fill="var(--ink-faint)"
                  fillOpacity={0.3}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </Brush>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
});
