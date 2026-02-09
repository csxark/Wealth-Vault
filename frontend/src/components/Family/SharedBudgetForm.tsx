import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const sharedBudgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  totalBudget: z.number().min(0.01, 'Budget must be greater than 0'),
  period: z.enum(['monthly', 'yearly']).default('monthly'),
  approvalRequired: z.boolean().default(false),
  approvalThreshold: z.number().min(0).optional(),
  categories: z.array(z.string()).default([]),
});

type SharedBudgetFormData = z.infer<typeof sharedBudgetSchema>;

interface SharedBudgetFormProps {
  vaultId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const SharedBudgetForm: React.FC<SharedBudgetFormProps> = ({
  vaultId,
  onSuccess,
  onCancel,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<SharedBudgetFormData>({
    resolver: zodResolver(sharedBudgetSchema),
    defaultValues: {
      period: 'monthly',
      approvalRequired: false,
      categories: [],
    },
  });

  const approvalRequired = watch('approvalRequired');

  // Mock categories - in real app, fetch from API
  const availableCategories = [
    'Food & Dining',
    'Transportation',
    'Entertainment',
    'Shopping',
    'Bills & Utilities',
    'Healthcare',
    'Education',
    'Travel',
    'Other',
  ];

  const onSubmit = async (data: SharedBudgetFormData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/vaults/${vaultId}/shared-budgets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          categories: selectedCategories,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create shared budget');
      }

      toast({
        title: 'Success',
        description: 'Shared budget created successfully',
      });

      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create shared budget',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addCategory = (category: string) => {
    if (!selectedCategories.includes(category)) {
      const newCategories = [...selectedCategories, category];
      setSelectedCategories(newCategories);
      setValue('categories', newCategories);
    }
  };

  const removeCategory = (category: string) => {
    const newCategories = selectedCategories.filter(c => c !== category);
    setSelectedCategories(newCategories);
    setValue('categories', newCategories);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Create Shared Budget</CardTitle>
        <CardDescription>
          Set up a collaborative budget that family members can contribute to and track together.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Budget Name</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g., Family Vacation Fund"
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Describe the purpose of this budget..."
              rows={3}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalBudget">Total Budget</Label>
              <Input
                id="totalBudget"
                type="number"
                step="0.01"
                min="0"
                {...register('totalBudget', { valueAsNumber: true })}
                placeholder="0.00"
              />
              {errors.totalBudget && (
                <p className="text-sm text-red-600">{errors.totalBudget.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="period">Period</Label>
              <Select
                onValueChange={(value) => setValue('period', value as 'monthly' | 'yearly')}
                defaultValue="monthly"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="approvalRequired"
                checked={approvalRequired}
                onCheckedChange={(checked) => setValue('approvalRequired', !!checked)}
              />
              <Label htmlFor="approvalRequired">Require approval for expenses</Label>
            </div>

            {approvalRequired && (
              <div className="space-y-2">
                <Label htmlFor="approvalThreshold">Approval Threshold ($)</Label>
                <Input
                  id="approvalThreshold"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('approvalThreshold', { valueAsNumber: true })}
                  placeholder="Expenses above this amount need approval"
                />
                {errors.approvalThreshold && (
                  <p className="text-sm text-red-600">{errors.approvalThreshold.message}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Allowed Categories (Optional)</Label>
            <p className="text-sm text-gray-600">
              Select categories this budget applies to. Leave empty to apply to all expenses.
            </p>

            <div className="flex flex-wrap gap-2 mb-2">
              {selectedCategories.map((category) => (
                <Badge key={category} variant="secondary" className="flex items-center gap-1">
                  {category}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => removeCategory(category)}
                  />
                </Badge>
              ))}
            </div>

            <Select onValueChange={addCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Add a category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories
                  .filter(cat => !selectedCategories.includes(cat))
                  .map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Budget'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
