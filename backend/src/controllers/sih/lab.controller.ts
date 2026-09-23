import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth";
import { getLab, listLabsForUser, publicLab, startLab, submitLab } from "../../services/virtual-lab.service";

export async function listVirtualLabs(req: AuthenticatedRequest, res: Response) {
  return res.json({ labs: await listLabsForUser(req.user!.id) });
}

export async function getVirtualLab(req: AuthenticatedRequest, res: Response) {
  const lab = getLab(String(req.params.id));
  if (!lab) return res.status(404).json({ message: "Lab not found" });
  return res.json({ lab: publicLab(lab) });
}

export async function submitVirtualLab(req: AuthenticatedRequest, res: Response) {
  try {
    return res.json(await submitLab(req.user!.id, String(req.params.id), req.body));
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ message: error?.message || "Could not submit lab." });
  }
}

export async function startVirtualLab(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(201).json(await startLab(req.user!.id, String(req.params.id)));
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ message: error?.message || "Could not start lab." });
  }
}
