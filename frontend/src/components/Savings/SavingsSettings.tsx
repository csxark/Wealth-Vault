import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, PiggyBank, Target, Settings } from 'lucide-react';
import { toast } from 'sonner';

interface SavingsSettingsData {
  savingsRoundUpEnabled: boolean;
  savingsGoalId: string | null;
  roundUpToNearest: string;
}

interface Goal {
  id: string;
  title: string;
  type: string;
  currentAmount: string;
  targetAmount: string;
  currency: string;
  status: string;
}

const ROUND_UP_OPTIONS = [
  { value: '1.00', label: 'To nearest $1' },
  { value: '5.00', label: 'To nearest $5' },
  { value: '10.00', label: 'To nearest $10' },
  { value: '0.50', label: 'To nearest $0.50' },
];

const SavingsSettings: React.FC = () => {
  const [settings, setSettings] = useState<SavingsSettingsData>({
    savingsRoundUpEnabled: false,
    savingsGoalId: null,
    roundUpToNearest: '1.00',
  });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadGoals();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/savings/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data.data);
      }
    } catch (error) {
      console.error('Failed to load savings settings:', error);
      toast.error('Failed to load savings settings');
    } finally {
      setLoading(false);
    }
  };

  const loadGoals = async () => {
    try {
      const response = await fetch('/api/savings/goals', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
      }
    } catch (error) {
      console.error('Failed to load goals:', error);
      toast.error('Failed to load savings goals');
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/savings/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success('Savings settings updated successfully');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to update savings settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (enabled: boolean) => {
    setSettings(prev => ({ ...prev, savingsRoundUpEnabled: enabled }));
  };

  const handleGoalChange = (goalId: string) => {
    setSettings(prev => ({ ...prev, savingsGoalId: goalId }));
  };

  const handleRoundUpChange = (roundUpToNearest: string) => {
    setSettings(prev => ({ ...prev, roundUpToNearest }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading settings...</span>
        </CardContent>
      </Card>
    );
  }

  const selectedGoal = goals.find(goal => goal.id === settings.savingsGoalId);
  const availableGoals = goals.filter(goal => goal.type === 'savings');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5" />
          Automated Savings Round-Up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="roundup-toggle" className="text-base font-medium">
              Enable Round-Up Savings
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatically round up your expenses and save the difference
            </p>
          </div>
          <Switch
            id="roundup-toggle"
            checked={settings.savingsRoundUpEnabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {settings.savingsRoundUpEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="goal-select">Savings Goal</Label>
              <Select value={settings.savingsGoalId || ''} onValueChange={handleGoalChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a savings goal" />
                </SelectTrigger>
                <SelectContent>
                  {availableGoals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span>{goal.title}</span>
                        <span className="text-sm text-muted-foreground">
                          ({goal.currency} {goal.currentAmount} / {goal.targetAmount})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableGoals.length === 0 && (
                <Alert>
                  <AlertDescription>
                    You don't have any savings goals yet. Create one first to enable round-up savings.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="roundup-amount">Round Up To</Label>
              <Select value={settings.roundUpToNearest} onValueChange={handleRoundUpChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUND_UP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedGoal && (
              <Alert>
                <Settings className="h-4 w-4" />
                <AlertDescription>
                  Round-ups will be automatically transferred to <strong>{selectedGoal.title}</strong>.
                  Each expense will be rounded up to the nearest {settings.roundUpToNearest === '1.00' ? '$1' :
                    settings.roundUpToNearest === '5.00' ? '$5' :
                    settings.roundUpToNearest === '10.00' ? '$10' : '$0.50'}.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        <Button
          onClick={saveSettings}
          disabled={saving || (settings.savingsRoundUpEnabled && !settings.savingsGoalId)}
          className="w-full"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
};

export default SavingsSettings;
