ALTER TABLE `workspaces` ADD `kind` text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `owner_user_id` text REFERENCES user(id);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_personal_owner_idx` ON `workspaces` (`owner_user_id`) WHERE "workspaces"."kind" = 'personal';
--> statement-breakpoint
CREATE TRIGGER workspace_kind_owner_insert_guard
BEFORE INSERT ON workspaces
WHEN NEW.kind NOT IN ('personal', 'shared')
  OR (NEW.kind = 'personal' AND NEW.owner_user_id IS NULL)
  OR (NEW.kind = 'shared' AND NEW.owner_user_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_KIND_OWNER_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER workspace_identity_immutable
BEFORE UPDATE OF kind, owner_user_id ON workspaces
WHEN NEW.kind IS NOT OLD.kind OR NEW.owner_user_id IS NOT OLD.owner_user_id
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_IDENTITY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER workspace_member_shared_insert_guard
BEFORE INSERT ON workspace_members
WHEN (SELECT kind FROM workspaces WHERE id = NEW.workspace_id) IS NOT 'shared'
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_MEMBER_REQUIRES_SHARED_WORKSPACE');
END;
--> statement-breakpoint
CREATE TRIGGER workspace_member_shared_update_guard
BEFORE UPDATE OF workspace_id, user_id ON workspace_members
WHEN (SELECT kind FROM workspaces WHERE id = NEW.workspace_id) IS NOT 'shared'
BEGIN
  SELECT RAISE(ABORT, 'WORKSPACE_MEMBER_REQUIRES_SHARED_WORKSPACE');
END;
