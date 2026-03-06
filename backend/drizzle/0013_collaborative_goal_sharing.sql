-- Migration: Collaborative Goal Sharing with Permission Inheritance
-- Issue: #611
-- Description: Implements role-based goal sharing with granular permissions and inheritance to contributions
-- Features: Share roles, permission inheritance, invitations, activity tracking, notifications

-- ========================================
-- Create Enums
-- ========================================

-- Share role enum
CREATE TYPE goal_share_role AS ENUM ('viewer', 'contributor', 'manager', 'owner');

-- Share status enum
CREATE TYPE goal_share_status AS ENUM ('pending', 'active', 'revoked', 'expired', 'declined');

-- Invitation method enum
CREATE TYPE invitation_method AS ENUM ('email', 'link', 'in_app');

-- ========================================
-- Create Tables
-- ========================================

-- Goal Shares table
-- Primary table managing who has access to which goals
CREATE TABLE goal_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  
  -- Owner and shared user
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_email text,
  shared_with_name text,
  
  -- Permission details
  role goal_share_role NOT NULL,
  permissions jsonb DEFAULT '{
    "canView": true,
    "canContribute": false,
    "canEdit": false,
    "canDelete": false,
    "canShare": false,
    "canViewContributions": true,
    "canEditOwnContributions": false,
    "canEditAllContributions": false,
    "canWithdraw": false,
    "canChangeGoalDetails": false
  }'::jsonb,
  
  -- Status tracking
  status goal_share_status DEFAULT 'active' NOT NULL,
  
  -- Invitation details
  invited_at timestamp DEFAULT now(),
  accepted_at timestamp,
  revoked_at timestamp,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamp,
  
  -- Invitation message
  invitation_message text,
  
  -- Metadata
  metadata jsonb DEFAULT '{
    "invitationMethod": "email",
    "shareReason": null,
    "lastAccessedAt": null,
    "accessCount": 0
  }'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  
  -- Unique constraint: one share per user per goal
  CONSTRAINT unique_user_goal_share UNIQUE (goal_id, shared_with_user_id)
);

-- Goal Share Invitations table
-- Tracks pending invitations before acceptance
CREATE TABLE goal_share_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  
  -- Inviter
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Invitee
  invitee_email text NOT NULL,
  invitee_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  
  -- Invitation details
  role goal_share_role NOT NULL,
  invitation_token text NOT NULL UNIQUE,
  invitation_method invitation_method DEFAULT 'email' NOT NULL,
  
  -- Message
  personal_message text,
  
  -- Status
  status goal_share_status DEFAULT 'pending' NOT NULL,
  sent_at timestamp DEFAULT now(),
  expires_at timestamp NOT NULL,
  
  -- Response
  responded_at timestamp,
  decline_reason text,
  
  -- Resulting share (if accepted)
  resulting_share_id uuid REFERENCES goal_shares(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{
    "remindersSent": 0,
    "lastReminderAt": null
  }'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Goal Share Activity Log table
-- Comprehensive audit trail for shared goals
CREATE TABLE goal_share_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  share_id uuid REFERENCES goal_shares(id) ON DELETE CASCADE,
  
  -- Actor
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_email text,
  user_name text,
  
  -- Activity details
  activity_type text NOT NULL,
  action text NOT NULL,
  description text,
  
  -- Changes
  changes_before jsonb,
  changes_after jsonb,
  
  -- Context
  ip_address text,
  user_agent text,
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now()
);

-- Goal Contribution Permissions table
-- Implements permission inheritance from goal shares to contributions
CREATE TABLE goal_contribution_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  contribution_id uuid NOT NULL,
  
  -- Permission holder
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Inherited from share
  inherited_from_share_id uuid REFERENCES goal_shares(id) ON DELETE CASCADE,
  
  -- Specific permissions
  can_edit boolean DEFAULT false NOT NULL,
  can_delete boolean DEFAULT false NOT NULL,
  can_view boolean DEFAULT true NOT NULL,
  
  -- Ownership
  is_owner boolean DEFAULT false NOT NULL,
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Goal Share Settings table
-- Per-goal sharing configuration
CREATE TABLE goal_share_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Sharing settings
  is_sharing_enabled boolean DEFAULT true NOT NULL,
  allow_link_sharing boolean DEFAULT false NOT NULL,
  require_approval boolean DEFAULT false NOT NULL,
  
  -- Default permissions
  default_role goal_share_role DEFAULT 'viewer' NOT NULL,
  
  -- Limits
  max_shares text DEFAULT '10',
  current_share_count text DEFAULT '0',
  
  -- Link sharing
  public_share_token text UNIQUE,
  public_share_expires_at timestamp,
  link_share_role goal_share_role DEFAULT 'viewer',
  
  -- Contribution rules
  contribution_rules jsonb DEFAULT '{
    "requireApprovalForContributions": false,
    "minContributionAmount": null,
    "maxContributionAmount": null,
    "allowWithdrawals": false
  }'::jsonb,
  
  -- Notifications
  notify_on_new_share boolean DEFAULT true,
  notify_on_contribution boolean DEFAULT true,
  notify_on_milestone boolean DEFAULT true,
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  
  CONSTRAINT unique_goal_share_settings UNIQUE (goal_id)
);

-- Goal Share Notifications table
-- Track notifications for shared goal activities
CREATE TABLE goal_share_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_id uuid REFERENCES goal_shares(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  
  -- Status
  is_read boolean DEFAULT false NOT NULL,
  read_at timestamp,
  
  -- Actions
  action_url text,
  action_label text,
  
  -- Priority
  priority text DEFAULT 'normal',
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamp DEFAULT now()
);

-- ========================================
-- Create Indexes
-- ========================================

-- Goal Shares indexes
CREATE INDEX idx_goal_shares_tenant_id ON goal_shares(tenant_id);
CREATE INDEX idx_goal_shares_goal_id ON goal_shares(goal_id);
CREATE INDEX idx_goal_shares_owner_id ON goal_shares(owner_id);
CREATE INDEX idx_goal_shares_shared_with_user_id ON goal_shares(shared_with_user_id);
CREATE INDEX idx_goal_shares_status ON goal_shares(status);
CREATE INDEX idx_goal_shares_role ON goal_shares(role);
CREATE INDEX idx_goal_shares_expires_at ON goal_shares(expires_at) WHERE expires_at IS NOT NULL;

-- Goal Share Invitations indexes
CREATE INDEX idx_goal_share_invitations_tenant_id ON goal_share_invitations(tenant_id);
CREATE INDEX idx_goal_share_invitations_goal_id ON goal_share_invitations(goal_id);
CREATE INDEX idx_goal_share_invitations_invited_by ON goal_share_invitations(invited_by);
CREATE INDEX idx_goal_share_invitations_invitee_email ON goal_share_invitations(invitee_email);
CREATE INDEX idx_goal_share_invitations_invitee_user_id ON goal_share_invitations(invitee_user_id);
CREATE INDEX idx_goal_share_invitations_status ON goal_share_invitations(status);
CREATE INDEX idx_goal_share_invitations_token ON goal_share_invitations(invitation_token);
CREATE INDEX idx_goal_share_invitations_expires_at ON goal_share_invitations(expires_at);

-- Goal Share Activity Log indexes
CREATE INDEX idx_goal_share_activity_log_tenant_id ON goal_share_activity_log(tenant_id);
CREATE INDEX idx_goal_share_activity_log_goal_id ON goal_share_activity_log(goal_id);
CREATE INDEX idx_goal_share_activity_log_share_id ON goal_share_activity_log(share_id);
CREATE INDEX idx_goal_share_activity_log_user_id ON goal_share_activity_log(user_id);
CREATE INDEX idx_goal_share_activity_log_activity_type ON goal_share_activity_log(activity_type);
CREATE INDEX idx_goal_share_activity_log_created_at ON goal_share_activity_log(created_at);

-- Goal Contribution Permissions indexes
CREATE INDEX idx_goal_contribution_permissions_tenant_id ON goal_contribution_permissions(tenant_id);
CREATE INDEX idx_goal_contribution_permissions_goal_id ON goal_contribution_permissions(goal_id);
CREATE INDEX idx_goal_contribution_permissions_contribution_id ON goal_contribution_permissions(contribution_id);
CREATE INDEX idx_goal_contribution_permissions_user_id ON goal_contribution_permissions(user_id);
CREATE INDEX idx_goal_contribution_permissions_share_id ON goal_contribution_permissions(inherited_from_share_id);

-- Goal Share Settings indexes
CREATE INDEX idx_goal_share_settings_tenant_id ON goal_share_settings(tenant_id);
CREATE INDEX idx_goal_share_settings_goal_id ON goal_share_settings(goal_id);
CREATE INDEX idx_goal_share_settings_owner_id ON goal_share_settings(owner_id);
CREATE INDEX idx_goal_share_settings_public_token ON goal_share_settings(public_share_token) WHERE public_share_token IS NOT NULL;

-- Goal Share Notifications indexes
CREATE INDEX idx_goal_share_notifications_tenant_id ON goal_share_notifications(tenant_id);
CREATE INDEX idx_goal_share_notifications_goal_id ON goal_share_notifications(goal_id);
CREATE INDEX idx_goal_share_notifications_user_id ON goal_share_notifications(user_id);
CREATE INDEX idx_goal_share_notifications_share_id ON goal_share_notifications(share_id);
CREATE INDEX idx_goal_share_notifications_is_read ON goal_share_notifications(is_read);
CREATE INDEX idx_goal_share_notifications_created_at ON goal_share_notifications(created_at);

-- ========================================
-- Create Functions
-- ========================================

-- Function to automatically set permissions based on role
CREATE OR REPLACE FUNCTION set_permissions_from_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Set permissions based on role
  IF NEW.role = 'viewer' THEN
    NEW.permissions := jsonb_build_object(
      'canView', true,
      'canContribute', false,
      'canEdit', false,
      'canDelete', false,
      'canShare', false,
      'canViewContributions', true,
      'canEditOwnContributions', false,
      'canEditAllContributions', false,
      'canWithdraw', false,
      'canChangeGoalDetails', false
    );
  ELSIF NEW.role = 'contributor' THEN
    NEW.permissions := jsonb_build_object(
      'canView', true,
      'canContribute', true,
      'canEdit', false,
      'canDelete', false,
      'canShare', false,
      'canViewContributions', true,
      'canEditOwnContributions', true,
      'canEditAllContributions', false,
      'canWithdraw', true,
      'canChangeGoalDetails', false
    );
  ELSIF NEW.role = 'manager' THEN
    NEW.permissions := jsonb_build_object(
      'canView', true,
      'canContribute', true,
      'canEdit', true,
      'canDelete', false,
      'canShare', true,
      'canViewContributions', true,
      'canEditOwnContributions', true,
      'canEditAllContributions', true,
      'canWithdraw', true,
      'canChangeGoalDetails', true
    );
  ELSIF NEW.role = 'owner' THEN
    NEW.permissions := jsonb_build_object(
      'canView', true,
      'canContribute', true,
      'canEdit', true,
      'canDelete', true,
      'canShare', true,
      'canViewContributions', true,
      'canEditOwnContributions', true,
      'canEditAllContributions', true,
      'canWithdraw', true,
      'canChangeGoalDetails', true
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to inherit permissions to contributions
CREATE OR REPLACE FUNCTION inherit_permissions_to_contributions()
RETURNS TRIGGER AS $$
DECLARE
  contribution_record RECORD;
BEGIN
  -- Only process active shares
  IF NEW.status = 'active' THEN
    -- Create permission entries for all existing contributions on this goal
    FOR contribution_record IN 
      SELECT id FROM goal_contribution_line_items 
      WHERE goal_id = NEW.goal_id 
      AND tenant_id = NEW.tenant_id
    LOOP
      -- Insert or update permission for this contribution
      INSERT INTO goal_contribution_permissions (
        tenant_id,
        goal_id,
        contribution_id,
        user_id,
        inherited_from_share_id,
        can_edit,
        can_delete,
        can_view,
        is_owner
      ) VALUES (
        NEW.tenant_id,
        NEW.goal_id,
        contribution_record.id,
        NEW.shared_with_user_id,
        NEW.id,
        (NEW.permissions->>'canEditOwnContributions')::boolean OR (NEW.permissions->>'canEditAllContributions')::boolean,
        (NEW.permissions->>'canEditAllContributions')::boolean,
        (NEW.permissions->>'canViewContributions')::boolean,
        false
      )
      ON CONFLICT ON CONSTRAINT goal_contribution_permissions_pkey DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log share activity
CREATE OR REPLACE FUNCTION log_share_activity()
RETURNS TRIGGER AS $$
DECLARE
  activity_type_val text;
  action_val text;
  description_val text;
BEGIN
  -- Determine activity type based on operation
  IF TG_OP = 'INSERT' THEN
    activity_type_val := 'share_created';
    action_val := 'created share';
    description_val := 'New goal share created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      activity_type_val := 'status_changed';
      action_val := 'changed status';
      description_val := 'Share status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSIF OLD.role != NEW.role THEN
      activity_type_val := 'role_changed';
      action_val := 'changed role';
      description_val := 'Share role changed from ' || OLD.role || ' to ' || NEW.role;
    ELSE
      activity_type_val := 'share_updated';
      action_val := 'updated share';
      description_val := 'Share details updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    activity_type_val := 'share_deleted';
    action_val := 'deleted share';
    description_val := 'Share deleted';
  END IF;
  
  -- Insert activity log
  IF TG_OP = 'DELETE' THEN
    INSERT INTO goal_share_activity_log (
      tenant_id, goal_id, share_id, user_id,
      activity_type, action, description,
      changes_before, created_at
    ) VALUES (
      OLD.tenant_id, OLD.goal_id, OLD.id, OLD.owner_id,
      activity_type_val, action_val, description_val,
      row_to_json(OLD), now()
    );
    RETURN OLD;
  ELSE
    INSERT INTO goal_share_activity_log (
      tenant_id, goal_id, share_id, user_id,
      activity_type, action, description,
      changes_before, changes_after, created_at
    ) VALUES (
      NEW.tenant_id, NEW.goal_id, NEW.id, NEW.owner_id,
      activity_type_val, action_val, description_val,
      CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
      row_to_json(NEW), now()
    );
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update share count in settings
CREATE OR REPLACE FUNCTION update_share_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update share count for the goal
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE goal_share_settings
    SET current_share_count = (
      SELECT COUNT(*)::text
      FROM goal_shares
      WHERE goal_id = NEW.goal_id
      AND status = 'active'
    )
    WHERE goal_id = NEW.goal_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    UPDATE goal_share_settings
    SET current_share_count = (
      SELECT COUNT(*)::text
      FROM goal_shares
      WHERE goal_id = NEW.goal_id
      AND status = 'active'
    )
    WHERE goal_id = NEW.goal_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE goal_share_settings
    SET current_share_count = (
      SELECT COUNT(*)::text
      FROM goal_shares
      WHERE goal_id = OLD.goal_id
      AND status = 'active'
    )
    WHERE goal_id = OLD.goal_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Create Triggers
-- ========================================

-- Trigger to automatically set permissions from role
CREATE TRIGGER set_permissions_on_share
  BEFORE INSERT OR UPDATE OF role ON goal_shares
  FOR EACH ROW
  EXECUTE FUNCTION set_permissions_from_role();

-- Trigger to inherit permissions to contributions
CREATE TRIGGER inherit_permissions_on_share
  AFTER INSERT OR UPDATE OF status, permissions ON goal_shares
  FOR EACH ROW
  EXECUTE FUNCTION inherit_permissions_to_contributions();

-- Trigger to log share activity
CREATE TRIGGER log_share_activity_trigger
  AFTER INSERT OR UPDATE OR DELETE ON goal_shares
  FOR EACH ROW
  EXECUTE FUNCTION log_share_activity();

-- Trigger to update share count
CREATE TRIGGER update_share_count_trigger
  AFTER INSERT OR UPDATE OF status OR DELETE ON goal_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_share_count();

-- ========================================
-- Create Views
-- ========================================

-- View: Active shared goals per user
CREATE OR REPLACE VIEW v_user_shared_goals AS
SELECT 
  gs.id AS share_id,
  gs.tenant_id,
  gs.goal_id,
  g.title AS goal_title,
  g.description AS goal_description,
  g.target_amount,
  g.current_amount,
  g.currency,
  g.deadline,
  g.status AS goal_status,
  gs.shared_with_user_id AS user_id,
  gs.owner_id,
  u.full_name AS owner_name,
  u.email AS owner_email,
  gs.role,
  gs.permissions,
  gs.status AS share_status,
  gs.accepted_at,
  gs.created_at AS shared_at
FROM goal_shares gs
JOIN goals g ON gs.goal_id = g.id
JOIN users u ON gs.owner_id = u.id
WHERE gs.status = 'active'
AND (gs.expires_at IS NULL OR gs.expires_at > now());

-- View: Goal sharing summary
CREATE OR REPLACE VIEW v_goal_sharing_summary AS
SELECT 
  g.id AS goal_id,
  g.tenant_id,
  g.user_id AS owner_id,
  g.title AS goal_title,
  COUNT(DISTINCT gs.id) FILTER (WHERE gs.status = 'active') AS active_share_count,
  COUNT(DISTINCT gs.id) FILTER (WHERE gs.status = 'pending') AS pending_invite_count,
  COUNT(DISTINCT gsi.id) FILTER (WHERE gsi.status = 'pending') AS outstanding_invitation_count,
  COALESCE(gss.is_sharing_enabled, true) AS is_sharing_enabled,
  COALESCE(gss.max_shares, '10') AS max_shares,
  array_agg(DISTINCT gs.shared_with_user_id) FILTER (WHERE gs.status = 'active') AS shared_with_user_ids,
  array_agg(DISTINCT jsonb_build_object(
    'userId', gs.shared_with_user_id,
    'role', gs.role,
    'acceptedAt', gs.accepted_at
  )) FILTER (WHERE gs.status = 'active') AS active_shares
FROM goals g
LEFT JOIN goal_shares gs ON g.id = gs.goal_id
LEFT JOIN goal_share_invitations gsi ON g.id = gsi.goal_id
LEFT JOIN goal_share_settings gss ON g.id = gss.goal_id
GROUP BY g.id, g.tenant_id, g.user_id, g.title, gss.is_sharing_enabled, gss.max_shares;

-- View: Pending invitations
CREATE OR REPLACE VIEW v_pending_invitations AS
SELECT 
  gsi.id AS invitation_id,
  gsi.tenant_id,
  gsi.goal_id,
  g.title AS goal_title,
  g.target_amount,
  g.currency,
  gsi.invited_by,
  u1.full_name AS inviter_name,
  u1.email AS inviter_email,
  gsi.invitee_email,
  gsi.invitee_user_id,
  u2.full_name AS invitee_name,
  gsi.role,
  gsi.invitation_method,
  gsi.personal_message,
  gsi.sent_at,
  gsi.expires_at,
  gsi.status,
  EXTRACT(EPOCH FROM (gsi.expires_at - now())) / 3600 AS hours_until_expiry
FROM goal_share_invitations gsi
JOIN goals g ON gsi.goal_id = g.id
JOIN users u1 ON gsi.invited_by = u1.id
LEFT JOIN users u2 ON gsi.invitee_user_id = u2.id
WHERE gsi.status = 'pending'
AND gsi.expires_at > now();

-- View: Recent share activity
CREATE OR REPLACE VIEW v_recent_share_activity AS
SELECT 
  gsal.id AS activity_id,
  gsal.tenant_id,
  gsal.goal_id,
  g.title AS goal_title,
  gsal.share_id,
  gsal.user_id,
  gsal.user_name,
  gsal.user_email,
  gsal.activity_type,
  gsal.action,
  gsal.description,
  gsal.created_at
FROM goal_share_activity_log gsal
JOIN goals g ON gsal.goal_id = g.id
ORDER BY gsal.created_at DESC;

-- ========================================
-- Comments
-- ========================================

COMMENT ON TABLE goal_shares IS 'Manages collaborative goal sharing with role-based access control';
COMMENT ON TABLE goal_share_invitations IS 'Tracks pending invitations for goal sharing';
COMMENT ON TABLE goal_share_activity_log IS 'Audit trail for all goal sharing activities';
COMMENT ON TABLE goal_contribution_permissions IS 'Implements permission inheritance from goal shares to contributions';
COMMENT ON TABLE goal_share_settings IS 'Per-goal sharing configuration and rules';
COMMENT ON TABLE goal_share_notifications IS 'Notification system for shared goal activities';

COMMENT ON COLUMN goal_shares.role IS 'Share role: viewer (read-only), contributor (can add funds), manager (can edit), owner (full control)';
COMMENT ON COLUMN goal_shares.permissions IS 'Granular permissions derived from role';
COMMENT ON COLUMN goal_contribution_permissions.inherited_from_share_id IS 'Links permission to parent share for inheritance tracking';
