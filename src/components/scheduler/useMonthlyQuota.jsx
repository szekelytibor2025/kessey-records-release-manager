import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const QUOTA_KEY = "monthly_quota";
const DEFAULT_QUOTA = 3;

export function useMonthlyQuota() {
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["appConfig"],
    queryFn: () => base44.entities.AppConfig.filter({ key: QUOTA_KEY }),
  });

  const quotaRecord = configs[0];
  const quota = quotaRecord ? parseInt(quotaRecord.value, 10) : DEFAULT_QUOTA;

  const updateMutation = useMutation({
    mutationFn: async (newQuota) => {
      if (quotaRecord) {
        return base44.entities.AppConfig.update(quotaRecord.id, { value: String(newQuota) });
      } else {
        return base44.entities.AppConfig.create({ key: QUOTA_KEY, value: String(newQuota) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appConfig"] });
    },
  });

  return { quota, isLoading, updateQuota: updateMutation.mutate, isSaving: updateMutation.isPending };
}