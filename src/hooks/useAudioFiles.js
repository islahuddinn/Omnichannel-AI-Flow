import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

// Hook to fetch audio files
export function useAudioFiles() {
  return useQuery({
    queryKey: ["audioFiles"],
    queryFn: async () => {
      const { data } = await apiClient.get("/audio-files");
      return data; // Expecting array of objects or strings depending on API
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Hook to upload audio file
export function useUploadAudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => {
      const formData = new FormData();

      let fileToUpload = variables;
      let isDefault = "false";

      if (variables && variables.file) {
        fileToUpload = variables.file;
        isDefault = variables.is_default ? "true" : "false";
      }

      formData.append("file", fileToUpload);
      formData.append("is_default", isDefault);

      // Using post with formData implies we let the browser set the Content-Type header with boundary
      const { data } = await apiClient.post("/audio-files", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return data;
    },
    onSuccess: (data) => {
      // Optimistically add the new file to cache so dropdown immediately shows it and auto-select works
      const newFile = data?.data ?? data;
      if (newFile && (newFile._id || newFile.fileUrl)) {
        queryClient.setQueryData(["audioFiles"], (oldData) => {
          const list = Array.isArray(oldData) ? oldData : (oldData?.data || []);
          const arr = Array.isArray(list) ? list : [];
          const exists = arr.some(
            (f) => (f._id || f.id) === (newFile._id || newFile.id)
          );
          if (exists) return oldData;
          const newList = [newFile, ...arr];
          return Array.isArray(oldData) ? newList : { ...oldData, data: newList };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["audioFiles"] });
    },
  });
}

// Hook to update audio file
export function useUpdateAudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const response = await apiClient.put(`/audio-files/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audioFiles"] });
    },
  });
}

// Hook to delete audio file
export function useDeleteAudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      const response = await apiClient.delete(`/audio-files/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audioFiles"] });
    },
  });
}
