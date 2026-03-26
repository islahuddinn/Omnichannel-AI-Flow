"use client";

import { useFormContext, Controller } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import { chatFeatureOptions } from "../formOptions";

export default function ChatSettingsTab() {
  const {
    control,
    formState: { errors },
  } = useFormContext();

  const fieldVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.05, duration: 0.3 },
    }),
  };

  return (
    <div className="space-y-6">
      <motion.div
        variants={fieldVariants}
        custom={0}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        <div className="space-y-2 w-full">
          <Label>Chat Feature *</Label>
          <Controller
            name="chat_feature"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger className="w-full bg-input border-border">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {chatFeatureOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </motion.div>
    </div>
  );
}
