#!/bin/bash

# Test Deals Bulk Upsert API
# POST /api/deals/bulk-upsert

curl --location 'http://localhost:7001/api/deals/bulk-upsert' \
--header 'Content-Type: application/json' \
--data-raw '{
    "companyId": "68e4690e6d9f5392ce895e81",
    "dealsData": [
        {
            "action": "new",
            "Id": "TEST_001",
            "Name": "New Plumbing Service Deal",
            "Commission": "25.50",
            "Stage": "01. NOVE",
            "Status": "Open",
            "Deal_Type": "B2C",
            "Category": "03. Plumber",
            "Sub_Category": "03. Fix WC - Geberit",
            "Currency": "EUR",
            "Campaign": "Bratislava",
            "Contact_Name": "John Doe",
            "Contact_Phone": "+421 910 123 456",
            "Contact_Email": "john.doe@example.com",
            "Contact_City": "Bratislava",
            "Country": "Slovakia",
            "Handyman_Name": "Mike Smith",
            "Handyman_Email": "mike.smith@example.com",
            "Handyman_Phone": "+421 915 987 654",
            "Notes": "New deal created via API",
            "Payment": "Cash",
            "CustomField1": "Custom Value 1",
            "ExtraInfo": "This is extra field data"
        },
        {
            "action": "new",
            "Id": "TEST_002",
            "Name": "New Electrical Work Deal",
            "Commission": "45.80",
            "Stage": "02. PRIDELENE",
            "Status": "Open",
            "Deal_Type": "B2B",
            "Category": "04. Electrician",
            "Sub_Category": "04. Fix Wiring",
            "Currency": "EUR",
            "Campaign": "Kosice",
            "Contact_Name": "Jane Smith",
            "Contact_Phone": "+421 911 234 567",
            "Contact_Email": "jane.smith@example.com",
            "Contact_City": "Kosice",
            "Country": "Slovakia",
            "Handyman_Name": "Peter Johnson",
            "Handyman_Email": "peter.johnson@example.com",
            "Handyman_Phone": "+421 916 876 543",
            "Notes": "Electrical repair needed urgently",
            "Payment": "Bank Transfer"
        },
        {
            "action": "update",
            "Id": "TEST_001",
            "Name": "Updated Plumbing Service Deal",
            "Status": "In Progress",
            "Commission": "30.00",
            "Notes": "Updated deal information"
        },
        {
            "action": "delete",
            "Id": "TEST_002"
        }
    ]
}'

