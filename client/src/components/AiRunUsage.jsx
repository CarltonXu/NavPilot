import React from "react";
import Icon from "./Icon.jsx";

export default function AiRunUsage({ run, locale = "zh-CN", live = false, compact = false }) {
  if (!run) return null;
  const exact = (run.inputTokens || 0) + (run.outputTokens || 0) > 0;
  const input = Number(exact ? run.inputTokens : run.estimatedInputTokens) || 0;
  const output = Number(exact ? run.outputTokens : run.estimatedOutputTokens) || 0;
  const durationMs = Math.max(0, Number(run.durationMs) || 0);
  const firstTokenMs = run.firstTokenMs == null ? null : Math.max(0, Number(run.firstTokenMs) || 0);
  const generationMs = Math.max(1, durationMs - (firstTokenMs || 0));
  const averageSpeed = output > 0 && durationMs > 0 ? output / (generationMs / 1000) : 0;
  const en = locale === "en";
  const seconds = value => value == null ? "—" : `${(value / 1000).toFixed(value < 10000 ? 2 : 1)}s`;
  const values = [
    { key:"input", icon:"outputTokens", label:"Input", value:input.toLocaleString() },
    { key:"output", icon:"inputTokens", label:"Output", value:output.toLocaleString() },
    { key:"first", icon:"bolt", label:"First Token", value:seconds(firstTokenMs) },
    { key:"duration", icon:"clock", label:"Total Time", value:seconds(durationMs) },
    { key:"speed", icon:"speed", label:"Avg. Speed", value:`${averageSpeed.toFixed(1)} t/s` },
  ];
  return <section className={`ai-run-usage ${compact?"compact":""} ${live?"live":""}`}>
    <header><span><Icon name="insights" size={13}/>{en?"AI usage":"AI 用量"}</span><div><span title={run.model || ""}>{run.model || (en?"Waiting":"等待模型")}</span><span title={en?"Model calls":"模型调用"}><Icon name="refresh" size={10}/>{run.modelCalls || 0}</span><span title={en?"Tool calls":"平台能力"}><Icon name="tools" size={10}/>{run.toolCalls || 0}</span><small>{live?(en?"Live":"执行中"):(exact?(en?"Final":"最终"):(en?"Estimated":"估算"))}</small></div></header>
    <div className="ai-run-metrics">{values.map(item=><span className={item.key} key={item.key}><Icon name={item.icon} size={15}/><span><small>{item.label}</small><strong>{item.value}</strong></span></span>)}</div>
  </section>;
}
