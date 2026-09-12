import { useEffect, useState } from "react";
import {
  Users, Briefcase, Layers, ArrowRightLeft, Building2, MapPin, ScatterChart as ScatterIcon
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ScatterChart, Scatter, ZAxis
} from "recharts";
import { StatCard } from "../../../../components/ui/Card";
import { useAuth } from "../../../../context/AuthContext";
import { organizationApi } from "../../../../features/organization/services/organizationApi";

const DEPT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const BRANCH_COLORS = ["#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#ef4444"];
const DEPT_OTHER_COLOR = "#94a3b8";
const MAX_SLICES = 6;

function Lift({ children }) {
  return <div className="transition-transform duration-200 hover:-translate-y-0.5">{children}</div>;
}

function SectionCard({ title, subtitle, icon, compact, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200/80 dark:border-gray-800 shadow-sm p-6 transition-all hover:shadow-md flex flex-col h-full">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <h3 className={`font-bold text-gray-900 dark:text-white flex items-center gap-2.5 ${compact ? "text-sm" : "text-base"}`}>
            {icon && <span className="text-brand-600 dark:text-brand-400">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

function EmptyChart({ text, compact }) {
  return (
    <div className={`flex items-center justify-center ${compact ? "h-32" : "h-full"} text-xs font-semibold text-gray-400 dark:text-gray-500`}>
      {text}
    </div>
  );
}

export default function OverviewTab() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";
  
  const [summary, setSummary] = useState(null);
  const [companyCount, setCompanyCount] = useState(0);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [deptData, setDeptData] = useState([]);
  const [branchData, setBranchData] = useState([]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;

    organizationApi.headcountSummary({}, token, tokenType)
      .then(res => { if (active) setSummary(res?.data?.totals ?? null); })
      .catch(() => {});

    organizationApi.legalEntityProfileCompanies(token, tokenType)
      .then(res => { if (active) setCompanyCount(res?.data?.length || 0); })
      .catch(() => {});

    organizationApi.orgChanges({ status: "pending_approval" }, token, tokenType)
      .then(res => { if (active) setPendingChanges(res?.data?.total || res?.data?.data?.length || 0); })
      .catch(() => {});
      
    organizationApi.departmentBranchSummary(token, tokenType)
      .then(res => {
        if (!active) return;
        const depts = res?.data?.departments || [];
        const branches = res?.data?.branches || res?.data?.units || [];
        
        setDeptData(depts.map(d => ({ name: d.name || "Unknown", total: Number(d.employeeCount || d.total || 0) })));
        setBranchData(branches.map(b => ({ name: b.name || "Unknown", total: Number(b.employeeCount || b.total || 0) })));
      })
      .catch(() => {});

    return () => { active = false; };
  }, [token, tokenType]);

  // Format Department Pie Data
  const deptTotal = deptData.reduce((sum, d) => sum + d.total, 0);
  const sortedDept = [...deptData].sort((a, b) => b.total - a.total);
  const otherDeptTotal = sortedDept.slice(MAX_SLICES).reduce((sum, d) => sum + d.total, 0);
  const pieChartData = [
    ...sortedDept.slice(0, MAX_SLICES).map((d, i) => ({
      name: d.name, total: d.total, color: DEPT_COLORS[i % DEPT_COLORS.length],
    })),
    ...(otherDeptTotal > 0 ? [{ name: "Other", total: otherDeptTotal, color: DEPT_OTHER_COLOR }] : []),
  ].map((d) => ({ ...d, pct: deptTotal ? Math.round((d.total / deptTotal) * 100) : 0 }));

  // Format Branch Bar Data
  const topBranches = [...branchData].sort((a, b) => b.total - a.total).slice(0, 8);

  // Scatter Data (Derived distribution)
  const scatterData = sortedDept.map((d, i) => ({
    x: i + 1, // pseudo-index for spread
    y: d.total,
    z: d.total * 10, // size of bubble
    name: d.name,
    fill: DEPT_COLORS[i % DEPT_COLORS.length] || DEPT_OTHER_COLOR
  }));

  return (
    <div className="space-y-6 pb-12 font-sans text-gray-900 dark:text-gray-100">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Lift><StatCard compact title="Total Workforce" value={summary?.approvedHeadcount ?? "—"} icon={<Users size={20} />} color="blue" /></Lift>
        <Lift><StatCard compact title="Open Positions" value={summary?.vacantHeadcount ?? "—"} icon={<Briefcase size={20} />} color="yellow" /></Lift>
        <Lift><StatCard compact title="Total Companies" value={companyCount ?? "—"} icon={<Building2 size={20} />} color="green" /></Lift>
        <Lift><StatCard compact title="Pending Org Changes" value={pendingChanges ?? "—"} icon={<ArrowRightLeft size={20} />} color="red" /></Lift>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SectionCard title="Headcount by Department" subtitle="Distribution of employees" icon={<Layers size={18} />}>
          <div className="h-80">
            {pieChartData.length > 0 ? (
              <div className="flex flex-col h-full items-center gap-4 py-2">
                <div className="w-full h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieChartData} dataKey="total" nameKey="name" innerRadius="55%" outerRadius="95%" paddingAngle={2} stroke="none">
                        {pieChartData.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 12 }}
                        formatter={(value, _name, entry) => [`${value} (${entry.payload.pct}%)`, entry.payload.name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full flex flex-wrap justify-center gap-x-4 gap-y-2 px-2 max-h-24 overflow-y-auto text-xs">
                  {pieChartData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{d.name}</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 ml-1">{d.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyChart text="No department data available" />}
          </div>
        </SectionCard>

        <SectionCard title="Workforce by Branch" subtitle="Top branches by employee count" icon={<MapPin size={18} />}>
          <div className="h-80">
            {topBranches.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topBranches} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 12 }} 
                    cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                  />
                  <Bar dataKey="total" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={32}>
                    {topBranches.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={BRANCH_COLORS[index % BRANCH_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="No branch data available" />}
          </div>
        </SectionCard>

        <div className="xl:col-span-2">
          <SectionCard title="Department Density Analysis" subtitle="Headcount concentration mapping" icon={<ScatterIcon size={18} />}>
            <div className="h-72">
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis type="number" dataKey="x" name="Department Index" hide />
                    <YAxis type="number" dataKey="y" name="Headcount" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ZAxis type="number" dataKey="z" range={[100, 1500]} name="Density" />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      contentStyle={{ backgroundColor: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 12 }}
                      formatter={(value, name, props) => name === 'Headcount' ? [value, props.payload.name] : null}
                      labelFormatter={() => ''}
                    />
                    <Scatter name="Departments" data={scatterData}>
                      {scatterData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : <EmptyChart text="Not enough data for density chart" />}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
