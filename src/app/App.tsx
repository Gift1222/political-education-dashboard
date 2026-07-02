import { useState, useMemo, useEffect } from "react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import mnyLogo from "@/imports/logo_for_MNYP.png";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// Mirrors the public.course_completions table in Supabase.
// Most columns are nullable there, so we type them as such here too.
type Participant = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  district: string | null;
  age: string | null;
  gender: string | null;
  course_name: string | null;
  completed_at: string | null;
  certificate_url: string | null;
};

const RED = "#CC0000";
const GENDER_COLORS: Record<string, string> = {
  Female: "#CC0000",
  Male: "#ffffff",
  Other: "#888888",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#1A1A1A",
        border: "1px solid #CC0000",
        padding: "8px 14px",
        borderRadius: 2,
      }}
    >
      <p
        style={{ color: "#888", fontSize: 11, marginBottom: 2 }}
      >
        {label}
      </p>
      <p
        style={{
          color: "#fff",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {payload[0].value}
      </p>
    </div>
  );
};

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="block w-0.5 h-3 bg-primary flex-shrink-0" />
      <span
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          letterSpacing: "0.2em",
        }}
        className="text-primary text-[10px] font-bold uppercase tracking-widest"
      >
        {children}
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="bg-card border border-secondary rounded-sm overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />
      <div className="p-5">
        <p
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: "0.15em",
          }}
          className="text-[10px] text-muted-foreground uppercase font-semibold mb-2"
        >
          {label}
        </p>
        <p
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          className="text-4xl font-extrabold text-foreground leading-none mb-1"
        >
          {value}
        </p>
        <p className="text-[11px] text-primary font-semibold">
          {sub}
        </p>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-secondary rounded-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="block w-[3px] h-[14px] bg-primary rounded-sm flex-shrink-0" />
        <h3
          style={{ fontFamily: "'Barlow', sans-serif" }}
          className="text-[13px] font-semibold text-foreground"
        >
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

export default function App() {
  const [search, setSearch] = useState("");
  const [participants, setParticipants] = useState<Participant[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCompletions() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("course_completions")
        .select(
          "id, user_id, user_email, district, age, gender, course_name, completed_at, certificate_url",
        )
        .order("completed_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setParticipants([]);
      } else {
        setParticipants(data ?? []);
      }
      setLoading(false);
    }

    loadCompletions();

    // Keep the dashboard live: refresh whenever rows are added/changed.
    const channel = supabase
      .channel("course_completions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_completions" },
        () => loadCompletions(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const trendData = useMemo(() => {
    const monthly: Record<string, number> = {};
    participants.forEach((d) => {
      if (!d.completed_at) return;
      const m = d.completed_at.substring(0, 7);
      monthly[m] = (monthly[m] || 0) + 1;
    });
    return Object.entries(monthly)
      .sort()
      .map(([m, count]) => {
        const [y, mo] = m.split("-");
        const label = new Date(+y, +mo - 1, 1).toLocaleString(
          "en",
          { month: "short", year: "2-digit" },
        );
        return { label, count };
      });
  }, [participants]);

  const ageData = useMemo(() => {
    const buckets = [
      { label: "18-25", count: 0 },
      { label: "26-35", count: 0 },
      { label: "36-45", count: 0 },
      { label: "46-55", count: 0 },
      { label: "56+", count: 0 },
    ];
    participants.forEach((d) => {
      const a = d.age;
      if (a == null) return;
      if (a <= 25) buckets[0].count++;
      else if (a <= 35) buckets[1].count++;
      else if (a <= 45) buckets[2].count++;
      else if (a <= 55) buckets[3].count++;
      else buckets[4].count++;
    });
    const maxIdx = buckets.reduce(
      (mi, b, i, arr) => (b.count > arr[mi].count ? i : mi),
      0,
    );
    return buckets.map((b, i) => ({
      ...b,
      fill: i === maxIdx ? RED : "#2A2A2A",
    }));
  }, [participants]);

  const genderData = useMemo(() => {
    const counts: Record<string, number> = {};
    participants.forEach((d) => {
      const g = d.gender ?? "Unknown";
      counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts).map(([gender, count]) => ({
      gender,
      count,
    }));
  }, [participants]);

  const districtData = useMemo(() => {
    const counts: Record<string, number> = {};
    participants.forEach((d) => {
      const dist = d.district ?? "Unknown";
      counts[dist] = (counts[dist] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([district, count]) => ({ district, count }));
  }, [participants]);

  const kpis = useMemo(() => {
    const total = participants.length;
    const districts = new Set(
      participants.map((d) => d.district).filter(Boolean),
    ).size;
    const topAge = ageData.reduce(
      (best, b) => (b.count > best.count ? b : best),
      ageData[0],
    );
    const femaleCount = participants.filter(
      (d) => d.gender === "Female",
    ).length;
    const femalePct =
      total > 0 ? Math.round((femaleCount / total) * 100) : 0;
    return {
      total,
      districts,
      topAge: topAge?.label ?? "—",
      femalePct,
    };
  }, [participants, ageData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return participants;
    return participants.filter(
      (d) =>
        (d.user_id ?? "").toLowerCase().includes(q) ||
        (d.user_email ?? "").toLowerCase().includes(q) ||
        (d.district ?? "").toLowerCase().includes(q) ||
        (d.course_name ?? "").toLowerCase().includes(q),
    );
  }, [search, participants]);

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: "'Barlow', sans-serif" }}
    >
      {/* Header */}
      <header className="bg-background border-b-[3px] border-primary px-7 py-[18px] flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <ImageWithFallback
            src={mnyLogo}
            alt="Malawian National Youth in Politics logo"
            className="w-12 h-12 object-contain flex-shrink-0"
          />
          <div>
            <p
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.2em",
              }}
              className="text-[10px] text-muted-foreground uppercase font-semibold"
            >
              Training Management System
            </p>
            <h1
              style={{ fontFamily: "'Barlow', sans-serif" }}
              className="text-[17px] font-bold text-foreground leading-tight"
            >
              Political Education — Completion Dashboard
            </h1>
          </div>
        </div>
        <div
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: "0.12em",
          }}
          className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-sm uppercase"
        >
          Live Tracking
        </div>
      </header>

      {/* Main content */}
      <main className="px-7 py-7 max-w-[1600px] mx-auto">
        {error && (
          <div className="mb-6 bg-card border border-primary rounded-sm px-5 py-4 text-[13px] text-primary">
            Couldn't load data from Supabase: {error}
          </div>
        )}

        {loading && !error && (
          <div className="mb-6 bg-card border border-secondary rounded-sm px-5 py-4 text-[13px] text-muted-foreground">
            Loading completions…
          </div>
        )}

        {!loading && !error && participants.length === 0 && (
          <div className="mb-6 bg-card border border-secondary rounded-sm px-5 py-4 text-[13px] text-muted-foreground">
            No completions found yet in course_completions.
          </div>
        )}

        {/* KPIs */}
        <SectionLabel>Key Performance Indicators</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-8">
          <KpiCard
            label="Total Completed"
            value={kpis.total}
            sub="participants"
          />
          <KpiCard
            label="Districts Reached"
            value={kpis.districts}
            sub="unique districts"
          />
          <KpiCard
            label="Largest Age Group"
            value={kpis.topAge}
            sub="years old"
          />
          <KpiCard
            label="Gender Balance"
            value={`${kpis.femalePct}%`}
            sub="female participants"
          />
        </div>

        {/* Trend Analysis */}
        <SectionLabel>Trend Analysis</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-[1.7fr_1fr] gap-3.5 mb-3.5">
          {/* Line chart */}
          <ChartCard title="Completions Over Time">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={trendData}
                margin={{
                  top: 4,
                  right: 8,
                  left: -20,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  stroke="#1E1E1E"
                  strokeDasharray="0"
                />
                <XAxis
                  dataKey="label"
                  tick={{
                    fill: "#666",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={{ stroke: "#2A2A2A" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fill: "#666",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={{ stroke: "#2A2A2A" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={RED}
                  strokeWidth={2.5}
                  dot={{ fill: RED, r: 4, strokeWidth: 0 }}
                  activeDot={{
                    r: 6,
                    fill: RED,
                    stroke: "#0D0D0D",
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Gender donut */}
          <ChartCard title="Gender Distribution">
            <div className="flex flex-col">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={genderData}
                    dataKey="count"
                    nameKey="gender"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {genderData.map((entry) => (
                      <Cell
                        key={entry.gender}
                        fill={
                          GENDER_COLORS[entry.gender] ?? "#888"
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#1A1A1A",
                      border: "1px solid #2A2A2A",
                      borderRadius: 2,
                    }}
                    itemStyle={{
                      color: "#fff",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#888", fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2.5 mt-1">
                {genderData.map((g) => {
                  const pct = Math.round(
                    participants.length > 0
                      ? (g.count / participants.length) * 100
                      : 0,
                  );
                  return (
                    <div
                      key={g.gender}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            background:
                              GENDER_COLORS[g.gender] ?? "#888",
                          }}
                        />
                        <span className="text-[12px] text-secondary-foreground">
                          {g.gender}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily:
                            "'JetBrains Mono', monospace",
                        }}
                        className="text-[14px] font-bold text-foreground"
                      >
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Age + District */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-8">
          <ChartCard title="Age Range Distribution">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={ageData}
                margin={{
                  top: 4,
                  right: 8,
                  left: -20,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  stroke="#1E1E1E"
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{
                    fill: "#666",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={{ stroke: "#2A2A2A" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fill: "#666",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={{ stroke: "#2A2A2A" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {ageData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Completions by District">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={districtData}
                layout="vertical"
                margin={{
                  top: 4,
                  right: 8,
                  left: 8,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  stroke="#1E1E1E"
                  strokeDasharray="0"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{
                    fill: "#666",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={{ stroke: "#2A2A2A" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="district"
                  tick={{
                    fill: "#888",
                    fontSize: 11,
                    fontFamily: "'Barlow', sans-serif",
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  fill={RED}
                  radius={[0, 2, 2, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Participant Table */}
        <SectionLabel>Participant Records</SectionLabel>
        <div className="bg-card border border-secondary rounded-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-secondary">
            <div className="flex items-center gap-2">
              <span className="block w-[3px] h-[14px] bg-primary rounded-sm" />
              <h3
                style={{ fontFamily: "'Barlow', sans-serif" }}
                className="text-[13px] font-semibold text-foreground"
              >
                All Completions
              </h3>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                className="bg-secondary text-muted-foreground text-[11px] px-2.5 py-0.5 rounded-full"
              >
                {filtered.length}
              </span>
            </div>
            <input
              className="bg-background border border-secondary text-foreground placeholder-muted-foreground text-[12px] px-3.5 py-1.5 rounded-sm w-48 outline-none focus:border-primary transition-colors"
              style={{ fontFamily: "'Barlow', sans-serif" }}
              type="text"
              placeholder="Search user ID, email, district…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-[13px]">
                No participants match your search.
              </div>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {[
                      "#",
                      "User ID",
                      "User Email",
                      "District",
                      "Gender",
                      "Age",
                      "Course",
                      "Completed",
                      "Certificate",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3.5 py-2.5 text-left border-b border-secondary text-[10px] text-muted-foreground uppercase font-semibold"
                        style={{
                          letterSpacing: "0.12em",
                          fontFamily:
                            "'Barlow Condensed', sans-serif",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d, i) => (
                    <tr
                      key={d.id}
                      className="border-b border-[#1E1E1E] hover:bg-muted transition-colors cursor-default"
                    >
                      <td
                        className="px-3.5 py-3 text-muted-foreground"
                        style={{
                          fontFamily:
                            "'JetBrains Mono', monospace",
                          fontSize: 11,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td className="px-3.5 py-3 font-semibold text-foreground whitespace-nowrap">
                        {d.user_id || "—"}
                      </td>
                      <td className="px-3.5 py-3 text-muted-foreground">
                        {d.user_email || "—"}
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="bg-muted text-secondary-foreground px-2 py-0.5 rounded-sm text-[11px]">
                          {d.district || "—"}
                        </span>
                      </td>
                      <td
                        className="px-3.5 py-3 font-medium"
                        style={{
                          color:
                            d.gender === "Female"
                              ? RED
                              : "#888",
                        }}
                      >
                        {d.gender || "—"}
                      </td>
                      <td
                        className="px-3.5 py-3 text-secondary-foreground"
                        style={{
                          fontFamily:
                            "'JetBrains Mono', monospace",
                        }}
                      >
                        {d.age || "—"}
                      </td>
                      <td className="px-3.5 py-3 text-secondary-foreground max-w-[140px] truncate">
                        {d.course_name || "—"}
                      </td>
                      <td
                        className="px-3.5 py-3 text-muted-foreground whitespace-nowrap"
                        style={{
                          fontFamily:
                            "'JetBrains Mono', monospace",
                          fontSize: 11,
                        }}
                      >
                        {fmtDate(d.completed_at)}
                      </td>
                      <td className="px-3.5 py-3">
                        {d.certificate_url &&
                        d.certificate_url !== "#" ? (
                          <a
                            href={d.certificate_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary font-semibold text-[11px] hover:underline"
                          >
                            View ↗
                          </a>
                        ) : (
                          <span className="text-[#333] text-[11px]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}