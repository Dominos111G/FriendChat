import admin from 'firebase-admin';

import { 
  getUsersCollection, getMessagesCollection, 
  getLoginDetailsCollection, getTokensCollection,
  getReportsCollection
} from './firebaseController.js';

const reportHelper = {
  types: ["message", "chat", "user"],
  category: {
    general: [
      "Other",
    ],
    message: [
      "Spam & Suspicious Links",
      "Hate Speech",
      "Verbal Abuse",
      "Child Exploitation (Text)",
      "Self-Harm Encouragement",
      "Advertisement",
    ],
    chat: [
      "Inappropriate Video Content",
      "Audio Harassment",
      "Stream Disruption",
      "Child Sexual Abuse Material",
      "Endangering a Minor",
      "Chat Automation",
    ],
    user: [
      "Impersonation & Phishing",
      "Harassment & Cyberbullying",
      "Inappropriate Profile Picture",
      "Offensive Username",
      "Underage User",
      "Child Grooming Behavior",
      "Account Automation",
    ],
  },
};

export function getReportHelper(req, res) {
  return res.status(200).json(reportHelper);
}

export async function createReport(req, res) {
  const userId = req.body.userId;
  const reporterId = req.body.reporterId;
  const reportType = req.body.reportType;
  const reportCategory = req.body.reportedObjectId;
  const reportedObjectId = req.body.reportedObjectId;
  const reportedObjectContent = String(req.body.reportedObjectContent || '').trim();
  const roomId = String(req.body.roomId || '').trim();
  const additionalInfo = String(req.body.additionalInfo || '').trim();

  if (!userId || !reporterId || !reportType || !reportCategory || !reportedObjectId) {
    return res.status(400).json({ success: false, message: 'Something is missing.' });
  }
  
  if (userId == reporterId) {
    return res.status(400).json({ success: false, message: 'You can\'t report.' });
  }

  const reportRef = getReportsCollection();
  await reportRef.add({
    userId: userId,
    roomId: roomId,
    reporterId: reporterId,
    reportType: reportType,
    reportCategory: reportCategory,
    reportedObjectId: reportedObjectId,
    reportedObjectContent: reportedObjectContent,
    additionalInfo: additionalInfo,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }); 

  return res.status(200).json({ success: true, message: 'User reported successfuly.' });
}

export async function getReport(req, res) {
  const { userId } = req.params; // .../api/reports/get/USERID
    
  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is missing.' });
  }
  const reportRef = getReportsCollection();

  const snapshot = await reportRef.where('userId', '==', userId).get();
  if (snapshot.empty) {
    return res.status(404).json({ success: false, message: 'No reports found for this user.' });
  }

  const reports = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return res.status(200).json({ success: true, data: reports });
}

export async function removeReport(req, res) {
  const reportId = req.body.reportId;
  if (!reportId) {
    return res.status(400).json({ success: false, message: 'Something is missing.' });
  }

  const reportRef = getReportsCollection().doc(reportId);
  const reportDoc = await reportRef.get();
  if (!reportDoc.exists) {
    return res.status(404).json({ success: false, message: 'Report not found.' });
  }

  await reportRef.delete();
  return res.status(200).json({ success: true, message: 'Report deleted successfully.' });
}