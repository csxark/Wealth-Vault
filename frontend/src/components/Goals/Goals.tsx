const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>();
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { withLoading } = useLoading();
=======
export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>();
  const [loading, setLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({});
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | undefined>();
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>();
  const { user } = useAuth();
  const { withLoading } = useLoading();
