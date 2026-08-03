import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth.middleware";
import { Project } from "../models/Project.model";
import { User } from "../models/User.model";
import { AppError } from "../middleware/errorHandler";
import { generateSecureToken, activationExpiryDate } from "../services/token.service";
import { sendActivationEmail } from "../services/email.service";
import { createNotification } from "../services/notification.service";
import logger from "../config/logger";

// GET /api/projects/:projectId/users
export async function listProjectUsers(req: AuthRequest, res: Response) {
  const project = await Project.findById(req.params.projectId).populate(
    "members.user",
    "name email role status lastActive"
  );
  if (!project) throw new AppError("Project not found", 404);

  const members = project.members.map((m) => {
    const u = m.user as unknown as {
      _id: mongoose.Types.ObjectId;
      name: string;
      email: string;
      role: string;
      status: string;
      lastActive?: Date;
    };
    return {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      lastActive: u.lastActive,
      addedAt: m.addedAt,
    };
  });

  res.json(members);
}

// POST /api/projects/:projectId/users
export async function addProjectUser(req: AuthRequest, res: Response) {
  const { email } = req.body;
  const { projectId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) throw new AppError("Project not found", 404);

  // Check for duplicate membership
  let user = await User.findOne({ email }).select("+activationToken +activationTokenExpires");

  if (user) {
    const alreadyMember = project.members.some(
      (m) => m.user.toString() === user!._id.toString()
    );
    if (alreadyMember) {
      return res.status(409).json({ message: "User is already a member of this project" });
    }

    // Existing activated user — add directly
    if (user.status === "active") {
      project.members.push({ user: user._id, addedAt: new Date() });
      await project.save();

      // Notify existing members (excluding the newly added user)
      const actorId = new mongoose.Types.ObjectId(req.user!.id);
      const newUserId = user._id;
      try {
        await Promise.all(
          project.members
            .filter((m) => !m.user.equals(newUserId))
            .map((m) =>
              createNotification({
                recipient: m.user,
                type: "user",
                category: "member_added",
                title: "New team member added",
                message: `A new member has been added to project "${project.name}".`,
                actor: actorId,
                projectId: project._id,
              })
            )
        );
      } catch (err) {
        logger.error("Failed to send member_added notifications", {
          error: err instanceof Error ? err.message : err,
        });
      }

      return res.status(201).json({ message: "User added to project." });
    }

    // Pending — resend activation
    const token = generateSecureToken();
    user.activationToken = token;
    user.activationTokenExpires = activationExpiryDate();
    await user.save();
    project.members.push({ user: user._id, addedAt: new Date() });
    await project.save();
    await sendActivationEmail(user.email, user.name, token).catch(() => {});

    // Notify existing members (excluding the newly added user)
    try {
      const actorId = new mongoose.Types.ObjectId(req.user!.id);
      const newUserId = user._id;
      await Promise.all(
        project.members
          .filter((m) => !m.user.equals(newUserId))
          .map((m) =>
            createNotification({
              recipient: m.user,
              type: "user",
              category: "member_added",
              title: "New team member added",
              message: `A new member has been added to project "${project.name}".`,
              actor: actorId,
              projectId: project._id,
            })
          )
      );
    } catch (err) {
      logger.error("Failed to send member_added notifications (pending user)", {
        error: err instanceof Error ? err.message : err,
      });
    }

    return res.status(201).json({ message: "User added. Activation email resent." });
  }

  // New user — create pending account and send activation
  const token = generateSecureToken();
  user = await User.create({
    name: email.split("@")[0], // placeholder name; user sets it on activation
    email,
    password: generateSecureToken(), // temporary; replaced on activation
    role: "project_user",
    status: "pending",
    activationToken: token,
    activationTokenExpires: activationExpiryDate(),
  });

  project.members.push({ user: user._id, addedAt: new Date() });
  await project.save();
  await sendActivationEmail(user.email, user.name, token).catch(() => {});

  // Notify existing members (excluding the newly added user)
  try {
    const actorId = new mongoose.Types.ObjectId(req.user!.id);
    const newUserId = user._id;
    await Promise.all(
      project.members
        .filter((m) => !m.user.equals(newUserId))
        .map((m) =>
          createNotification({
            recipient: m.user,
            type: "user",
            category: "member_added",
            title: "New team member added",
            message: `A new member has been invited to project "${project.name}".`,
            actor: actorId,
            projectId: project._id,
          })
        )
    );
  } catch (err) {
    logger.error("Failed to send member_added notifications (new user)", {
      error: err instanceof Error ? err.message : err,
    });
  }

  res.status(201).json({ message: "User invited. Activation email sent." });
}

// DELETE /api/projects/:projectId/users/:userId
export async function removeProjectUser(req: AuthRequest, res: Response) {
  const { projectId, userId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) throw new AppError("Project not found", 404);

  const initialCount = project.members.length;
  project.members = project.members.filter(
    (m) => m.user.toString() !== userId
  );

  if (project.members.length === initialCount) {
    throw new AppError("User is not a member of this project", 404);
  }

  await project.save();

  // Notify remaining members
  try {
    const actorId = new mongoose.Types.ObjectId(req.user!.id);
    await Promise.all(
      project.members.map((m) =>
        createNotification({
          recipient: m.user,
          type: "user",
          category: "member_removed",
          title: "Team member removed",
          message: `A member has been removed from project "${project.name}".`,
          actor: actorId,
          projectId: project._id,
        })
      )
    );
  } catch (err) {
    logger.error("Failed to send member_removed notifications", {
      error: err instanceof Error ? err.message : err,
    });
  }

  res.json({ message: "User removed from project." });
}

// POST /api/projects/:projectId/users/:userId/resend-activation
export async function resendUserActivation(req: AuthRequest, res: Response) {
  const user = await User.findOne({
    _id: req.params.userId,
    status: "pending",
  }).select("+activationToken +activationTokenExpires");

  if (!user) throw new AppError("Pending user not found", 404);

  const token = generateSecureToken();
  user.activationToken = token;
  user.activationTokenExpires = activationExpiryDate();
  await user.save();
  await sendActivationEmail(user.email, user.name, token).catch(() => {});

  res.json({ message: "Activation email resent." });
}

// GET /api/projects/admin/users/:userId — single user with their associated projects (admin only)
export async function getUserById(req: AuthRequest, res: Response) {
  const user = await User.findById(req.params.userId).select(
    "name email company role status lastActive createdAt profileImage"
  );

  if (!user) throw new AppError("User not found", 404);

  const projects = await Project.find({
    $or: [{ createdBy: user._id }, { members: { $elemMatch: { user: user._id } } }],
  }).select("name municipality");

  const imageUrl = user.profileImage || null;

  res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    company: user.company,
    role: user.role,
    status: user.status,
    lastActive: user.lastActive,
    createdAt: user.createdAt,
    profileImage: imageUrl,
    image: imageUrl,
    projects: projects.map((project) => ({
      id: project._id,
      name: project.name,
      municipality: project.municipality,
    })),
  });
}

// GET /api/projects/admin/users — all users with their associated projects (admin only)
export async function listAllUsers(_req: AuthRequest, res: Response) {
  const [users, projects] = await Promise.all([
    User.find().select("name email company role status lastActive createdAt profileImage").sort({ createdAt: -1 }),
    Project.find().select("name municipality createdBy members.user"),
  ]);

  const projectsByUser = new Map<string, { id: mongoose.Types.ObjectId; name: string; municipality: string }[]>();

  for (const project of projects) {
    const projectSummary = {
      id: project._id,
      name: project.name,
      municipality: project.municipality,
    };
    const associatedUserIds = new Set([
      project.createdBy.toString(),
      ...project.members.map((member) => member.user.toString()),
    ]);

    for (const userId of associatedUserIds) {
      const userProjects = projectsByUser.get(userId) || [];
      userProjects.push(projectSummary);
      projectsByUser.set(userId, userProjects);
    }
  }

  res.json(
    users.map((user) => {
      const imageUrl = user.profileImage || null;
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        company: user.company,
        role: user.role,
        status: user.status,
        lastActive: user.lastActive,
        createdAt: user.createdAt,
        profileImage: imageUrl,
        image: imageUrl,
        projects: projectsByUser.get(user._id.toString()) || [],
      };
    })
  );
}
