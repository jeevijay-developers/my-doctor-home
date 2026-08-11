import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export interface DonutSegment {
  label: string;
  count: number;
  color: string;
}

interface PaymentStatusDonutProps {
  buckets: DonutSegment[];
  total: number;
}

const PaymentStatusDonut = ({ buckets, total }: PaymentStatusDonutProps) => {
  const chartData = buckets.filter((b) => b.count > 0);

  return (
    <div>
      <div className="relative w-40 h-40 mx-auto mb-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                innerRadius="65%"
                outerRadius="90%"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {chartData.map((b) => (
                  <Cell key={b.label} fill={b.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full rounded-full border-[6px] border-secondary" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="font-heading font-bold text-xl text-foreground">{total}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
              <span className="text-muted-foreground text-xs">{b.label}</span>
            </div>
            <span className="font-medium text-foreground text-xs">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PaymentStatusDonut;
