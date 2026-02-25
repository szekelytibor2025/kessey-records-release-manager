import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { RefreshCw, TrendingUp } from "lucide-react";

async function fetchEurHuf() {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: "What is the current EUR to HUF exchange rate? Give me only the numeric value as a JSON object.",
    add_context_from_internet: true,
    response_json_schema: {
      type: "object",
      properties: {
        rate: { type: "number", description: "EUR to HUF exchange rate" },
        date: { type: "string", description: "Date of the rate" }
      }
    }
  });
  return result;
}

export function useEurHufRate() {
  return useQuery({
    queryKey: ["eurHufRate"],
    queryFn: fetchEurHuf,
    staleTime: 1000 * 60 * 30, // 30 min
    refetchOnWindowFocus: false,
  });
}

export default function ExchangeRateDisplay() {
  const { data, isLoading, refetch, isFetching } = useEurHufRate();

  return (
    <div className="flex items-center gap-3 text-xs">
      <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
      <span className="text-slate-400">
        1 EUR = {isLoading ? "..." : <span className="text-white font-medium">{data?.rate?.toFixed(2)} HUF</span>}
      </span>
      <button
        onClick={() => refetch()}
        className="p-1 rounded hover:bg-slate-800 transition-colors"
        disabled={isFetching}
      >
        <RefreshCw className={`w-3 h-3 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}