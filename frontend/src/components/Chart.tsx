import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { download } from "../exports";
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);
export interface Point {
  label: string;
  value: number | null;
}
export function Chart({
  title,
  points,
  kind = "bar",
  unit = "",
  description = "",
  countUnit,
  percentageBase,
}: {
  title: string;
  points: Point[];
  kind?: "bar" | "line" | "pie";
  unit?: string;
  description?: string;
  countUnit?: "participants" | "contributions" | "accounts";
  percentageBase?: number;
}) {
  const { t, i18n } = useTranslation();
  const [percentage, setPercentage] = useState(false);
  const total =
    percentageBase ??
    points.reduce((sum, point) => sum + (point.value ?? 0), 0);
  const shownPoints = useMemo(
    () =>
      percentage
        ? points.map((point) => ({
            ...point,
            value:
              point.value === null || !total
                ? null
                : (point.value / total) * 100,
          }))
        : points,
    [points, percentage, total],
  );
  const shownUnit = percentage ? "%" : unit;
  const node = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!node.current) return;
    const chart = echarts.init(node.current, undefined, { renderer: "svg" });
    instance.current = chart;
    const option: EChartsOption = {
      color: ["#245b76", "#16816b", "#bf6339", "#7b658d", "#947326", "#737b84"],
      aria: {
        enabled: true,
        label: { description: title },
        decal: { show: true },
      },
      animation: false,
      tooltip: {
        trigger: kind === "pie" ? "item" : "axis",
        valueFormatter: (value) =>
          Number(value).toLocaleString(i18n.resolvedLanguage, {
            maximumFractionDigits: 1,
          }) + (shownUnit === "%" ? " %" : ""),
      },
      grid: { left: 70, right: 30, bottom: 85, top: 30, containLabel: true },
      ...(kind === "pie"
        ? {
            legend: { bottom: 0, type: "scroll" },
            series: [
              {
                type: "pie",
                radius: ["40%", "65%"],
                center: ["50%", "42%"],
                label: {
                  formatter: (point) =>
                    Number(point.value).toLocaleString(i18n.resolvedLanguage, {
                      maximumFractionDigits: 1,
                    }) + (percentage ? " %" : ""),
                },
                data: shownPoints
                  .filter((p) => p.value !== null)
                  .map((p) => ({ name: p.label, value: p.value! })),
              },
            ],
          }
        : {
            xAxis: {
              type: "category",
              data: points.map((p) => p.label),
              axisLabel: {
                fontSize: 11,
                formatter: (label: string) =>
                  label.replace(
                    i18n.resolvedLanguage === "en" ? " to " : " à ",
                    i18n.resolvedLanguage === "en" ? "\nto " : "\nà ",
                  ),
                rotate: points.length > 8 ? 40 : 0,
                hideOverlap: false,
              },
            },
            yAxis: {
              type: "value",
              minInterval: percentage ? 0 : 1,
              name: shownUnit,
              min: 0,
              ...(shownUnit === "%" ? { max: 100 } : {}),
            },
            series: [
              {
                type: kind,
                data: shownPoints.map((p) => p.value),
                label: {
                  show: true,
                  position: "top",
                  formatter: (v) =>
                    v.value === null
                      ? ""
                      : Number(v.value).toLocaleString(i18n.resolvedLanguage, {
                          maximumFractionDigits: 1,
                        }),
                },
                ...(kind === "line"
                  ? { connectNulls: false, symbolSize: 8 }
                  : {}),
              },
            ],
          }),
    };
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, [
    title,
    points,
    shownPoints,
    kind,
    shownUnit,
    percentage,
    i18n.resolvedLanguage,
  ]);
  async function save(format: "svg" | "png") {
    const svg = node.current?.querySelector("svg");
    if (!svg) return;
    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    if (format === "svg") {
      download(blob, title + ".svg");
      return;
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1400;
      canvas.height = 800;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1400, 800);
      ctx.drawImage(img, 0, 0, 1400, 800);
      const output = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (output) download(output, title + ".png");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return (
    <section className="chart">
      <h2>{title}</h2>
      {description && <p className="hint">{description}</p>}
      {countUnit && (
        <>
          <div className="actions" aria-label={title}>
            <button
              aria-pressed={!percentage}
              onClick={() => setPercentage(false)}
            >
              {t("absoluteValues")}
            </button>
            <button
              aria-pressed={percentage}
              disabled={!total}
              onClick={() => setPercentage(true)}
            >
              {t("percentageValues")}
            </button>
          </div>
          <p className="hint">
            {percentage
              ? t(
                  countUnit === "accounts"
                    ? "newAccounts.percentageAccounts"
                    : countUnit === "participants"
                      ? "percentageParticipants"
                      : "percentageContributions",
                  { count: total },
                )
              : t(
                  countUnit === "accounts"
                    ? "newAccounts.accountUnit"
                    : countUnit === "participants"
                      ? "participantUnit"
                      : "contributionUnit",
                )}
          </p>
        </>
      )}
      <div ref={node} className="chart-canvas" role="img" aria-label={title} />
      <details>
        <summary>{t("equivalent")}</summary>
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>{t("category.OTHER")}</th>
              <th>
                {percentage || unit === "%"
                  ? "%"
                  : countUnit
                    ? t(
                        countUnit === "participants"
                          ? "participantUnit"
                          : "contributionUnit",
                      )
                    : t("count")}
              </th>
            </tr>
          </thead>
          <tbody>
            {shownPoints.map((p) => (
              <tr key={p.label}>
                <th>{p.label}</th>
                <td>
                  {p.value === null
                    ? t("unavailable")
                    : p.value.toLocaleString(i18n.resolvedLanguage, {
                        maximumFractionDigits: 2,
                      }) + (shownUnit === "%" ? " %" : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="chart-actions">
        <button onClick={() => void save("png")}>{t("png")}</button>
        <button onClick={() => void save("svg")}>{t("svg")}</button>
      </div>
    </section>
  );
}
