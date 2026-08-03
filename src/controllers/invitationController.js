const asyncHandler = require('../utils/asyncHandler');
const invitationService = require('../services/invitationService');
const { signToken, setAuthCookie } = require('../utils/authToken');

function requestMetadata(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function invitationView(invitation) {
  const now = new Date();
  let status = 'active';
  if (invitation.consumedAt) status = 'consumed';
  else if (invitation.revokedAt) status = 'revoked';
  else if (invitation.expiresAt <= now) status = 'expired';
  return {
    id: invitation.id,
    email: invitation.email,
    createdBy: invitation.createdBy,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    consumedAt: invitation.consumedAt,
    revokedAt: invitation.revokedAt,
    status,
  };
}

exports.create = asyncHandler(async (req, res) => {
  const { invitation, plainToken } = await invitationService.createInvitation({
    email: req.body.email,
    pastor: req.user,
    ...requestMetadata(req),
  });
  res.status(201).json({
    invitation: invitationView(invitation),
    token: plainToken,
    invitationUrl: `/api/invitations/${plainToken}`,
  });
});

exports.list = asyncHandler(async (_req, res) => {
  const invitations = await invitationService.listInvitations();
  res.json({ invitations: invitations.map(invitationView) });
});

exports.revoke = asyncHandler(async (req, res) => {
  const invitation = await invitationService.revokeInvitation({
    invitationId: req.params.id,
    pastor: req.user,
    ...requestMetadata(req),
  });
  res.json({ invitation: invitationView(invitation) });
});

exports.inspect = asyncHandler(async (req, res) => {
  const invitation = await invitationService.inspectInvitation(req.params.token);
  res.json({ valid: true, invitation });
});

exports.redeem = asyncHandler(async (req, res) => {
  const { user, recoveryCodes } = await invitationService.redeemInvitation({
    plainToken: req.params.token,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    password: req.body.password,
    email: req.body.email,
    ...requestMetadata(req),
  });
  setAuthCookie(res, signToken(user));
  res.status(201).json({
    user: user.toSafeObject(),
    recoveryCodes,
    message: 'Account created. Save your recovery codes somewhere safe; they will not be shown again.',
  });
});
