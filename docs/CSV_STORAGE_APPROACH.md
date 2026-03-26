# CSV Contact Storage Approach

## How We Store Hundreds of Dynamic Fields

### Problem
- CSV files can have **hundreds of columns** per record
- We don't know field names in advance (dynamic)
- Creating separate columns for each field is **not scalable**

### Solution: MongoDB Map/Object Field

We use a single `details` field (MongoDB Map) to store all unknown/dynamic CSV fields:

```javascript
// Contact Schema
details: {
  type: Map,
  of: mongoose.Schema.Types.Mixed,
  default: {}
}
```

### How It Works

1. **Standard Fields** (name, email, phone, etc.) → Stored as separate schema fields
2. **Unknown/Dynamic Fields** → Stored in `details` Map

### Example

**CSV Row:**
```csv
Name,Email,Phone,Salesforce_ID,Account_Name,Industry,Annual_Revenue,Employee_Count,...
John,john@example.com,+1234567890,SF001,ABC Corp,Tech,5000000,100,...
```

**Stored in MongoDB:**
```javascript
{
  name: "John",
  email: "john@example.com",
  phone: "+1234567890",
  details: {
    "Salesforce_ID": "SF001",
    "Account_Name": "ABC Corp",
    "Industry": "Tech",
    "Annual_Revenue": "5000000",
    "Employee_Count": "100",
    // ... hundreds more fields
  }
}
```

### Benefits

1. **No Schema Changes**: Don't need to modify schema for new CSV columns
2. **Efficient Storage**: MongoDB handles nested documents efficiently
3. **Flexible Querying**: Can query `details` fields using dot notation
4. **Scalable**: Can store unlimited fields without performance issues
5. **Indexable**: Can create indexes on specific `details` fields if needed

### Querying Details

```javascript
// Find contacts by details field
Contact.find({ 'details.Salesforce_ID': 'SF001' })

// Find contacts with specific industry
Contact.find({ 'details.Industry': 'Tech' })

// Update details field
Contact.updateOne(
  { _id: contactId },
  { $set: { 'details.Annual_Revenue': '6000000' } }
)
```

### Performance Considerations

1. **Indexes**: Only index frequently queried `details` fields
2. **Size Limits**: MongoDB document size limit is 16MB (sufficient for most cases)
3. **Query Performance**: Use specific field queries, avoid scanning entire `details` object

### Storage Structure

```
Contact Document:
├── Standard Fields (name, email, phone, etc.) → Indexed, Fast Queries
├── identifiers → Channel-specific IDs
├── details → All dynamic CSV fields (Map/Object)
│   ├── Salesforce_ID: "SF001"
│   ├── Account_Name: "ABC Corp"
│   ├── Industry: "Tech"
│   └── ... (hundreds more)
└── metadata → Import tracking info
```

This approach is **professional, scalable, and efficient** for handling millions of records with hundreds of fields each.

