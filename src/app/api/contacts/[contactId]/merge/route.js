// src/app/api/contacts/[contactId]/merge/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Contact from '@/models/schemas/Contact';
import Conversation from '@/models/schemas/Conversation';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { contactId } = await params;
    const { targetContactId } = await request.json();

    if (!targetContactId) {
      return NextResponse.json(
        { success: false, error: 'Target contact ID is required' },
        { status: 400 }
      );
    }

    if (contactId === targetContactId) {
      return NextResponse.json(
        { success: false, error: 'Cannot merge contact with itself' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const [sourceContact, targetContact] = await Promise.all([
      Contact.findById(contactId),
      Contact.findById(targetContactId)
    ]);

    if (!sourceContact || !targetContact) {
      return NextResponse.json(
        { success: false, error: 'One or both contacts not found' },
        { status: 404 }
      );
    }

    // Merge contact data
    targetContact.tags = [...new Set([...targetContact.tags, ...sourceContact.tags])];
    targetContact.customFields = { ...sourceContact.customFields, ...targetContact.customFields };
    
    if (!targetContact.email && sourceContact.email) {
      targetContact.email = sourceContact.email;
    }
    if (!targetContact.phone && sourceContact.phone) {
      targetContact.phone = sourceContact.phone;
    }

    await targetContact.save();

    // Update all conversations to point to target contact
    await Conversation.updateMany(
      { contact: contactId },
      { $set: { contact: targetContactId } }
    );

    // Delete source contact
    await sourceContact.deleteOne();

    return NextResponse.json({
      success: true,
      message: 'Contacts merged successfully',
      data: targetContact
    });
  } catch (error) {
    console.error('Merge contacts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to merge contacts' },
      { status: 500 }
    );
  }
}