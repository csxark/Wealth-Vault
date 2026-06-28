import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Settings, Crown, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '../../services/api';
import { VaultWithRole } from '../../types';

const Vaults: React.FC = () => {
  const [vaults, setVaults] = useState<VaultWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVaults();
  }, []);

  const fetchVaults = async () => {
    try {
      const response = await api.vaults.getAll();
      setVaults(response.data);
    } catch (error) {
      console.error('Failed to fetch vaults:', error);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">My Vaults</h1>
            <p className="text-blue-100">Manage your collaborative financial vaults</p>
          </div>
          <Link to="/vaults/create">
            <Button className="bg-white text-blue-900 hover:bg-blue-50">
              <Plus className="h-4 w-4 mr-2" />
              Create Vault
            </Button>
          </Link>
        </div>

        {vaults.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-12 text-center">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">No vaults yet</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first collaborative vault to start managing shared finances with family or friends.
            </p>
            <Link to="/vaults/create">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Vault
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vaults.map((vault) => (
              <Card key={vault.id} className="bg-white dark:bg-slate-800 shadow-xl hover:shadow-2xl transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl text-gray-900 dark:text-white">{vault.name}</CardTitle>
                      <CardDescription className="text-gray-600 dark:text-gray-400 mt-1">
                        {vault.description || 'No description'}
                      </CardDescription>
                    </div>
                    <Badge variant={vault.role === 'owner' ? 'default' : 'secondary'} className="ml-2">
                      {vault.role === 'owner' ? (
                        <>
                          <Crown className="h-3 w-3 mr-1" />
                          Owner
                        </>
                      ) : (
                        <>
                          <Users className="h-3 w-3 mr-1" />
                          Member
                        </>
                      )}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <span>Currency: {vault.currency}</span>
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Joined {new Date(vault.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <Link to={`/vaults/${vault.id}`} className="flex-1">
                      <Button variant="outline" className="w-full">
                        <Settings className="h-4 w-4 mr-2" />
                        Manage
                      </Button>
                    </Link>
                    <Link to={`/vaults/${vault.id}/members`}>
                      <Button variant="outline" size="sm">
                        <Users className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Vaults;