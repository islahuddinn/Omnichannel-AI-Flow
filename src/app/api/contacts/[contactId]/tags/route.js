// src/app/api/contacts/[contactId]/tags/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Contact from '@/models/schemas/Contact';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { contactId } = await params;
    const { tags } = await request.json();

    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { success: false, error: 'Tags must be an array' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    contact.tags = [...new Set([...contact.tags, ...tags])];
    await contact.save();

    return NextResponse.json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Add tags error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add tags' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { contactId } = await params;
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');

    if (!tag) {
      return NextResponse.json(
        { success: false, error: 'Tag parameter is required' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const contact = await Contact.findByIdAndUpdate(
      contactId,
      { $pull: { tags: tag } },
      { new: true }
    );

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Remove tag error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove tag' },
      { status: 500 }
    );
  }
}