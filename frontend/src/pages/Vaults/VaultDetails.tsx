import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Users, DollarSign, TrendingUp, Calendar, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '../../services/api';
import { Vault, VaultMember } from '../../types';

const VaultDetails: React.FC = () => {
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  const [vault, setVault] = useState<Vault | null>(null);
  const [members, setMembers] = useState<VaultMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVaultData = useCallback(async () => {
    if (!vaultId) return;

    try {
      setLoading(true);
      const [vaultResponse, membersResponse] = await Promise.all([
        api.vaults.getById(vaultId),
        api.vaults.members.getByVaultId(vaultId),
      ]);

      setVault(vaultResponse.data);
      setMembers(membersResponse.data);
    } catch (error) {
      console.error('Failed to fetch vault data:', error);
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    if (vaultId) {
      fetchVaultData();
    }
  }, [vaultId, fetchVaultData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl">
          <div className="animate-pulse flex space-x-4">
            <div className="rounded-full bg-slate-200 dark:bg-slate-700 h-12 w-12"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl text-center">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Vault not found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">The vault you're looking for doesn't exist or you don't have access.</p>
          <Button onClick={() => navigate('/vaults')}>
            Back to Vaults
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700">
      <div className="container mx-auto px-4 py-8">
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
            <h1 className="text-3xl font-bold text-white mb-2">{vault.name}</h1>
            <p className="text-blue-100">{vault.description || 'No description'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white dark:bg-slate-800 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{members.length}</div>
              <p className="text-xs text-muted-foreground">
                Active participants
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Currency</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vault.currency}</div>
              <p className="text-xs text-muted-foreground">
                Vault currency
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{vault.status}</div>
              <p className="text-xs text-muted-foreground">
                Vault status
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Activity tracking coming soon</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Vault Members</h3>
              <Link to={`/vaults/${vaultId}/members`}>
                <Button>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Members
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {members.map((member) => (
                <Card key={member.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{member.firstName} {member.lastName}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{member.email}</p>
                      </div>
                      <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                        {member.role === 'owner' ? (
                          <>
                            <Crown className="h-3 w-3 mr-1" />
                            Owner
                          </>
                        ) : (
                          member.role
                        )}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="budgets" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Shared Budgets</h3>
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Shared budget management coming soon</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Vault Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold">Vault Name</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{vault.name}</p>
                  </div>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold">Description</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{vault.description || 'No description'}</p>
                  </div>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold">Currency</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{vault.currency}</p>
                  </div>
                  <Button variant="outline" size="sm">Change</Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default VaultDetails;