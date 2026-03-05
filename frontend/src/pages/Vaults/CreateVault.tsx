import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '../../services/api';

const vaultSchema = z.object({
  name: z.string().min(1, 'Vault name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  currency: z.string().min(3, 'Currency code must be 3 characters').max(3, 'Currency code must be 3 characters').default('USD'),
});

type VaultFormData = z.infer<typeof vaultSchema>;

const CreateVault: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<VaultFormData>({
    resolver: zodResolver(vaultSchema),
    defaultValues: {
      currency: 'USD',
    },
  });

  const currency = watch('currency');

  const currencies = [
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
    { code: 'GBP', name: 'British Pound' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'CAD', name: 'Canadian Dollar' },
    { code: 'AUD', name: 'Australian Dollar' },
    { code: 'CHF', name: 'Swiss Franc' },
    { code: 'CNY', name: 'Chinese Yuan' },
    { code: 'INR', name: 'Indian Rupee' },
  ];

  const onSubmit = async (data: VaultFormData) => {
    setIsSubmitting(true);
    try {
      await api.vaults.create(data);
      toast({
        title: 'Success',
        description: 'Vault created successfully!',
      });
      navigate('/vaults');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create vault. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-8">
            <Button
              variant="ghost"
              onClick={() => navigate('/vaults')}
              className="text-white hover:bg-white/10 mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Vaults
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white">Create New Vault</h1>
              <p className="text-blue-100">Set up a collaborative financial vault</p>
            </div>
          </div>

          <Card className="bg-white dark:bg-slate-800 shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-900 dark:text-white">Vault Details</CardTitle>
              <CardDescription>
                Create a shared space for managing finances with family or friends
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-900 dark:text-white">
                    Vault Name *
                  </Label>
                  <Input
                    id="name"
                    {...register('name')}
                    placeholder="e.g., Family Budget 2024"
                    className="bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600"
                  />
                  {errors.name && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-gray-900 dark:text-white">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    {...register('description')}
                    placeholder="Optional description of the vault's purpose..."
                    rows={3}
                    className="bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600"
                  />
                  {errors.description && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.description.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency" className="text-gray-900 dark:text-white">
                    Currency *
                  </Label>
                  <Select
                    value={currency}
                    onValueChange={(value) => setValue('currency', value)}
                  >
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((curr) => (
                        <SelectItem key={curr.code} value={curr.code}>
                          {curr.code} - {curr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.currency && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.currency.message}</p>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-slate-700 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">What happens next?</h3>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• You'll become the vault owner with full administrative rights</li>
                    <li>• You can invite members via email invitations</li>
                    <li>• Members can contribute to shared budgets and track expenses</li>
                    <li>• All financial data is securely shared within the vault</li>
                  </ul>
                </div>

                <div className="flex space-x-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/vaults')}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? (
                      'Creating...'
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Create Vault
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateVault;