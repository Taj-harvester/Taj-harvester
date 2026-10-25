/**
 * ============================================================================
 * TAJ HARVESTER — STAFF & OWNER AUTHENTICATION MANAGEMENT (Owner Only)
 * ============================================================================
 * Allows the Shop Owner to:
 * 1. Add new Staff login accounts (User ID & Password)
 * 2. View existing Staff credentials (if a staff member forgets their password,
 *    they ask the Owner, who can see and update their credentials here)
 * 3. Update the Owner's own password (initialized from .env)
 */

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { OwnerAccount, StaffAccount } from '../types/shop';
import { Button, Card, Input } from './ui/primitives';

interface StaffAndAuthViewProps {
  ownerAccount: OwnerAccount;
  staffAccounts: StaffAccount[];
  onAddOrUpdateStaff: (payload: {
    fullName: string;
    username: string;
    password: string;
  }) => Promise<void>;
  onDeleteStaff: (id: string) => Promise<void>;
  onUpdateOwnerPassword: (payload: {
    currentPassword: string;
    newPassword: string;
    email?: string;
  }) => Promise<void>;
}

export const StaffAndAuthView: React.FC<StaffAndAuthViewProps> = ({
  ownerAccount,
  staffAccounts,
  onAddOrUpdateStaff,
  onDeleteStaff,
  onUpdateOwnerPassword,
}) => {
  // Add Staff State
  const [staffFullName, setStaffFullName] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(true);

  // Update Owner Password State
  const [currentOwnerPassword, setCurrentOwnerPassword] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [ownerEmail, setOwnerEmail] = useState(ownerAccount.email);

  useEffect(() => {
    setOwnerEmail(ownerAccount.email);
  }, [ownerAccount.email]);

  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (!staffFullName.trim() || !staffUsername.trim() || !staffPassword.trim()) {
      setErrorMsg('Please enter Staff Name, User ID, and Password.');
      return;
    }

    setSubmitting(true);
    try {
      await onAddOrUpdateStaff({
        fullName: staffFullName.trim(),
        username: staffUsername.trim(),
        password: staffPassword.trim(),
      });
      setStatusMsg(`Saved staff credentials for ${staffFullName.trim()} (${staffUsername.trim()}).`);
      setStaffFullName('');
      setStaffUsername('');
      setStaffPassword('');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (!currentOwnerPassword.trim() || !newOwnerPassword.trim()) {
      setErrorMsg('Please enter both your current password and new password.');
      return;
    }

    setSubmitting(true);
    try {
      await onUpdateOwnerPassword({
        currentPassword: currentOwnerPassword.trim(),
        newPassword: newOwnerPassword.trim(),
        email: ownerEmail.trim(),
      });
      setStatusMsg('Owner password updated successfully.');
      setCurrentOwnerPassword('');
      setNewOwnerPassword('');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Staff &amp; Owner Access
        </h1>
      </div>

      {statusMsg && (
        <div
          role="status"
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-sm"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {statusMsg}
          </span>
          <button
            type="button"
            onClick={() => setStatusMsg('')}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
        >
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add Staff & View Staff Credentials */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
              <UserPlus className="w-4 h-4 text-slate-900" />
              <h2 className="text-base font-bold text-slate-900">
                Add or Update Staff Login
              </h2>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="staff-full-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Staff Name *
                </label>
                <Input
                  id="staff-full-name"
                  required
                  value={staffFullName}
                  onChange={(e) => setStaffFullName(e.target.value)}
                  placeholder="e.g. Ravi Kumar"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-user-id"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Staff User ID *
                </label>
                <Input
                  id="staff-user-id"
                  required
                  value={staffUsername}
                  onChange={(e) => setStaffUsername(e.target.value)}
                  placeholder="e.g. staff_ravi"
                  className="font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="staff-password"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Staff Password *
                </label>
                <Input
                  id="staff-password"
                  required
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="e.g. staff123"
                  className="font-mono"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end pt-1">
                <Button type="submit" variant="amber" disabled={submitting}>
                  <Plus className="w-4 h-4" />
                  Save Staff Credentials
                </Button>
              </div>
            </form>
          </Card>

          {/* Staff Credentials Table (Visible to Owner) */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Staff Credentials ({staffAccounts.length})
                </h2>
                <p className="text-xs text-slate-500">
                  If staff forgets their login, share or update their User ID and Password below.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPasswords((p) => !p)}
              >
                {showPasswords ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide Passwords
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Show Passwords
                  </>
                )}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                    <th className="py-3 px-4 font-semibold">Staff Name</th>
                    <th className="py-3 px-4 font-semibold">User ID</th>
                    <th className="py-3 px-4 font-semibold">Password</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {staffAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                        No staff accounts added yet. Use the form above to add staff.
                      </td>
                    </tr>
                  ) : (
                    staffAccounts.map((staff) => (
                      <tr key={staff.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {staff.fullName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-900">
                          {staff.username}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-amber-800">
                          {showPasswords ? staff.password : '••••••••'}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setStaffFullName(staff.fullName);
                              setStaffUsername(staff.username);
                              setStaffPassword(staff.password);
                            }}
                            className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${staff.username}`}
                            onClick={() => onDeleteStaff(staff.id)}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer inline-flex items-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Owner Account & Update Password */}
        <Card className="lg:col-span-5 p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">
              Owner Account (.env Configured)
            </h2>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Owner User ID:</span>
              <span className="font-mono font-bold text-slate-900">
                {ownerAccount.username}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Recovery Email:</span>
              <span className="font-mono font-semibold text-slate-800">
                {ownerAccount.email}
              </span>
            </div>
          </div>

          <form onSubmit={handleOwnerPasswordSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="owner-recovery-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Owner Recovery Email (Used for Forgot Password)
              </label>
              <Input
                id="owner-recovery-email"
                type="email"
                required
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="owner-current-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Current Owner Password *
              </label>
              <Input
                id="owner-current-password"
                type="password"
                required
                value={currentOwnerPassword}
                onChange={(e) => setCurrentOwnerPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>

            <div>
              <label
                htmlFor="owner-new-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                New Owner Password *
              </label>
              <Input
                id="owner-new-password"
                type="password"
                required
                value={newOwnerPassword}
                onChange={(e) => setNewOwnerPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              <KeyRound className="w-4 h-4" />
              Update Owner Password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
