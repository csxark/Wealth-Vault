import React, { useMemo } from "react";
import { Check, X, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
}

interface PasswordRequirement {
  label: string;
  met: boolean;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
  showRequirements = true,
}) => {
  const analysis = useMemo(() => {
    const requirements: PasswordRequirement[] = [
      { label: "At least 9 characters", met: password.length >= 9 },
      { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
      { label: "Contains lowercase letter", met: /[a-z]/.test(password) },
      { label: "Contains a number", met: /\d/.test(password) },
      {
        label: "Contains special character (@$!%*?&)",
        met: /[@$!%*?&]/.test(password),
      },
    ];

    const metCount = requirements.filter((r) => r.met).length;

    let strength: "weak" | "medium" | "strong" | "very-strong" = "weak";
    let strengthLabel = "Weak";
    let strengthColor = "bg-red-500";
    let strengthTextColor = "text-red-500";
    let percentage = 0;

    if (metCount === 5) {
      strength = "very-strong";
      strengthLabel = "Very Strong";
      strengthColor = "bg-emerald-500";
      strengthTextColor = "text-emerald-500";
      percentage = 100;
    } else if (metCount >= 4) {
      strength = "strong";
      strengthLabel = "Strong";
      strengthColor = "bg-green-500";
      strengthTextColor = "text-green-500";
      percentage = 80;
    } else if (metCount >= 3) {
      strength = "medium";
      strengthLabel = "Medium";
      strengthColor = "bg-yellow-500";
      strengthTextColor = "text-yellow-500";
      percentage = 60;
    } else if (metCount >= 2) {
      strength = "weak";
      strengthLabel = "Weak";
      strengthColor = "bg-orange-500";
      strengthTextColor = "text-orange-500";
      percentage = 40;
    } else if (password.length > 0) {
      strength = "weak";
      strengthLabel = "Very Weak";
      strengthColor = "bg-red-500";
      strengthTextColor = "text-red-500";
      percentage = 20;
    }

    return {
      requirements,
      strength,
      strengthLabel,
      strengthColor,
      strengthTextColor,
      percentage,
      metCount,
    };
  }, [password]);

  if (!password) return null;

  const ShieldIcon =
    analysis.strength === "very-strong" || analysis.strength === "strong"
      ? ShieldCheck
      : analysis.strength === "medium"
      ? Shield
      : ShieldAlert;

  return (
    <div className="mt-2 space-y-3">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <ShieldIcon className={`w-4 h-4 ${analysis.strengthTextColor}`} />
            <span className={`font-medium ${analysis.strengthTextColor}`}>
              {analysis.strengthLabel}
            </span>
          </div>
          <span className="text-gray-400 text-xs">
            {analysis.metCount}/5 requirements
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${analysis.strengthColor} transition-all duration-300 ease-out rounded-full`}
            style={{ width: `${analysis.percentage}%` }}
          />
        </div>
      </div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
          {analysis.requirements.map((req, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 ${
                req.met
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            >
              {req.met ? (
                <Check className="w-4 h-4 flex-shrink-0" />
              ) : (
                <X className="w-4 h-4 flex-shrink-0" />
              )}
              <span className={req.met ? "" : "line-through opacity-60"}>
                {req.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PasswordStrengthMeter;
