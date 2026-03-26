// src/services/mobile/MobileJobService.js
/**
 * Mobile Job Service
 * Handles all job/deal operations for handyman mobile app
 * Jobs = Deals in the system
 */

import { getTenantDB } from '../../config/database.js';
import DealSchema from '../../models/schemas/Deal.js';
import ContactSchema from '../../models/schemas/Contact.js';
import SocketEmitter from '../socket/SocketEmitter.js';
import SalesforceDealService from '../salesforce/SalesforceDealService.js';
import { SF, getDetail, setDetail } from '../salesforce/salesforceDealFields.js';

class MobileJobService {
  /**
   * Initialize models for tenant database
   */
  initModels(companyId) {
    return getTenantDB(companyId).then(tenantDB => ({
      Deal: tenantDB.models.Deal || tenantDB.model('Deal', DealSchema),
      Contact: tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema),
      tenantDB
    }));
  }

  /**
   * Find deal by Mongo _id or Salesforce deal_id (supports both ID formats)
   */
  async findDealByIdOrSfId(Deal, dealId) {
    if (!dealId) return null;
    const isMongoId = /^[a-fA-F0-9]{24}$/.test(String(dealId));
    if (isMongoId) {
      return Deal.findById(dealId);
    }
    return Deal.findOne({ deal_id: dealId });
  }

  /**
   * Get jobs for handyman (home screen)
   * Organizes jobs by: Unscheduled, Today, Tomorrow, Future
   */
  async getJobsForHandyman(sfId, companyId, options = {}) {
    const { Deal, Contact } = await this.initModels(companyId);

    // Get handyman contact by SF_id
    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      throw new Error('Contact not found or not a handyman');
    }

    const handymanSFId = handyman.SF_id;
    if (!handymanSFId) {
      return {
        unscheduled: [],
        today: [],
        tomorrow: [],
        future: [],
        past: []
      };
    }

    // Query deals assigned to this handyman with Deal_Type = B2A
    // Note: Field name in database is "Deal_Type" (capital D, capital T) not "DEAL_TYPE"
    const query = {
      'details.Handyman': handymanSFId,
      $or: [
        { 'details.Deal_Type': 'B2A' }, // Primary: Deal_Type (capital D, capital T) - matches database
        { 'details.DEAL_TYPE': 'B2A' }, // Fallback: DEAL_TYPE (all caps) - in case some records use this
      ],
    };

    // Apply status filter if provided
    if (options.status) {
      query.status = options.status;
    } else {
      // By default, exclude only Lost deals (but include cancelled if they're not Lost)
      // This allows showing cancelled deals that might still be relevant
      query.status = { $ne: 'Lost' };
    }

    console.log('🔍 Querying B2A deals for handyman:', {
      handymanSFId,
      query: JSON.stringify(query, null, 2),
    });

    // Get all B2A deals for this handyman
    const deals = await Deal.find(query).sort({ createdAt: -1 }).lean();
    
    console.log(`✅ Found ${deals.length} B2A deals for handyman ${handymanSFId}`);
    
    // Log sample deal for debugging
    if (deals.length > 0) {
      console.log('📋 Sample deal:', {
        id: deals[0]._id,
        name: deals[0].name,
        dealType: deals[0].details?.Deal_Type || deals[0].details?.DEAL_TYPE,
        handyman: deals[0].details?.Handyman,
        customer: deals[0].details?.Customer,
        status: deals[0].status,
        stage: deals[0].stage || deals[0].details?.Stage,
      });
    } else {
      // Debug: Check if deals exist without B2A filter
      const allDeals = await Deal.find({ 'details.Handyman': handymanSFId }).lean();
      console.log(`⚠️ Found ${allDeals.length} total deals for handyman (without B2A filter)`);
      if (allDeals.length > 0) {
        console.log('📋 Sample deal (without filter):', {
          id: allDeals[0]._id,
          name: allDeals[0].name,
          dealType: allDeals[0].details?.Deal_Type || allDeals[0].details?.DEAL_TYPE || 'NOT SET',
          handyman: allDeals[0].details?.Handyman,
          customer: allDeals[0].details?.Customer,
          status: allDeals[0].status,
        });
      }
    }

    // Collect all unique customer SF_ids from deals
    const customerSFIds = [...new Set(deals.map(deal => deal.details?.Customer).filter(Boolean))];
    
    // Fetch all customer contacts in one query
    let customersMap = {};
    if (customerSFIds.length > 0) {
      const customers = await Contact.find({ 
        SF_id: { $in: customerSFIds } 
      }).lean();
      
      // Create a map for quick lookup
      customersMap = customers.reduce((map, customer) => {
        map[customer.SF_id] = customer;
        return map;
      }, {});
      
      console.log(`👥 Fetched ${customers.length} customer contacts for ${customerSFIds.length} unique customer IDs`);
    }

    // Organize by date
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const unscheduled = [];
    const todayJobs = [];
    const tomorrowJobs = [];
    const futureJobs = [];
    const pastJobs = [];

    for (const deal of deals) {
      // Get customer details from the map
      const customerSFId = deal.details?.Customer;
      const customer = customerSFId ? customersMap[customerSFId] : null;
      
      const job = this.formatJobForMobile(deal, handyman, customer);

      // Check if job has appointment date
      const appointmentDate = this.getAppointmentDate(deal);
      
      if (!appointmentDate) {
        // Unscheduled job
        unscheduled.push(job);
      } else {
        const jobDate = new Date(appointmentDate);
        jobDate.setHours(0, 0, 0, 0);

        if (jobDate.getTime() === today.getTime()) {
          todayJobs.push(job);
        } else if (jobDate.getTime() === tomorrow.getTime()) {
          tomorrowJobs.push(job);
        } else if (jobDate < today) {
          pastJobs.push(job);
        } else {
          futureJobs.push(job);
        }
      }
    }

    // Sort by time (earliest first)
    const sortByTime = (a, b) => {
      const timeA = this.getAppointmentTime(a) || '23:59';
      const timeB = this.getAppointmentTime(b) || '23:59';
      return timeA.localeCompare(timeB);
    };

    todayJobs.sort(sortByTime);
    tomorrowJobs.sort(sortByTime);
    futureJobs.sort((a, b) => {
      const dateA = new Date(this.getAppointmentDate(a) || 0);
      const dateB = new Date(this.getAppointmentDate(b) || 0);
      return dateA - dateB;
    });

    return {
      unscheduled,
      today: todayJobs,
      tomorrow: tomorrowJobs,
      future: futureJobs,
      past: pastJobs
    };
  }

  /**
   * Get single job details with visit timeline
   */
  async getJobDetails(dealId, sfId, companyId) {
    const { Deal, Contact } = await this.initModels(companyId);

    // Get handyman contact by SF_id
    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      throw new Error('Contact not found or not a handyman');
    }

    const dealDoc = await this.findDealByIdOrSfId(Deal, dealId);
    let deal = null;
    if (dealDoc) {
      if (typeof dealDoc.toObject === 'function') {
        deal = dealDoc.toObject();
      } else {
        deal = dealDoc;
      }
    }
    if (!deal) {
      throw new Error('Job not found');
    }

    const handymanSFId = handyman.SF_id;
    if (deal.details?.Handyman !== handymanSFId) {
      throw new Error('Access denied: Job not assigned to this handyman');
    }

    // Fetch customer details
    const customerSFId = deal.details?.Customer;
    let customer = null;
    if (customerSFId) {
      customer = await Contact.findOne({ SF_id: customerSFId }).lean();
      if (customer) {
        console.log(`✅ Found customer for deal ${dealId}: ${customer.name || customer.displayName || customerSFId}`);
      } else {
        console.warn(`⚠️ Customer not found for SF_id: ${customerSFId}`);
      }
    }

    return this.formatJobDetailsForMobile(deal, handyman, customer);
  }

  /**
   * Start work on a job
   * Records GPS location, start time, updates status
   */
  async startWork(dealId, sfId, companyId, gpsData) {
    const { Deal, Contact } = await this.initModels(companyId);

    // Get handyman by SF_id
    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      throw new Error('Contact not found or not a handyman');
    }

    // Get deal
    const deal = await this.findDealByIdOrSfId(Deal, dealId);
    if (!deal) {
      throw new Error('Job not found');
    }

    if (deal.details?.Handyman !== handyman.SF_id) {
      throw new Error('Access denied');
    }

    const now = new Date();
    const currentVisit = this.getCurrentVisitNumber(deal);

    // Update deal with start information
    if (!deal.details) deal.details = {};
    
    // Set start time for current visit (Salesforce exact field name __c)
    const startTimeField = `Job_Start_Time_${currentVisit}__c`;
    setDetail(deal.details, startTimeField, now.toISOString());

    if (gpsData) {
      if (currentVisit === 1) {
        setDetail(deal.details, SF.GPS_Start_Latitude__c, gpsData.latitude);
        setDetail(deal.details, SF.GPS_Start_Longitude__c, gpsData.longitude);
      }
      const gpsLatField = `GPS_Start_Lat_${currentVisit}`;
      const gpsLongField = `GPS_Start_Long_${currentVisit}`;
      deal.details[gpsLatField] = gpsData.latitude;
      deal.details[gpsLongField] = gpsData.longitude;

      const customerAddress = deal.details?.Customer_Address;
      if (customerAddress && gpsData.latitude && gpsData.longitude) {
        const distance = this.calculateDistance(
          gpsData.latitude,
          gpsData.longitude,
          customerAddress
        );
        setDetail(deal.details, SF.GPS_Distance_From_Customer__c, distance);
        deal.details[`GPS_Distance_${currentVisit}`] = distance;
        
        // Alert if distance > 500m
        if (distance > 500) {
          // Emit alert to office (socket event)
          await SocketEmitter.emit(
            `company:${companyId}`,
            'mobile:job:gps_alert',
            {
              dealId: deal._id.toString(),
              dealName: deal.name,
              handymanName: `${handyman.firstName || ''} ${handyman.lastName || ''}`.trim(),
              distance,
              location: { lat: gpsData.latitude, lng: gpsData.longitude },
              timestamp: now
            }
          );
        }
      }
    }

    deal.status = 'Diagnostic running';
    setDetail(deal.details, 'Status__c', 'Diagnostic running');

    deal.markModified('details');
    await deal.save();

    if (deal.deal_id) {
      const sfResult = await SalesforceDealService.syncStartWork(deal.toObject ? deal.toObject() : deal, currentVisit);
      if (!sfResult.success) console.warn('⚠️ Salesforce start-work sync failed:', sfResult.error);
    }

    // Fetch customer details
    const customerSFId = deal.details?.Customer;
    let customer = null;
    if (customerSFId) {
      customer = await Contact.findOne({ SF_id: customerSFId }).lean();
    }

    // Emit real-time update
    await this.emitJobUpdate(deal, companyId, 'job:started');

    return this.formatJobDetailsForMobile(deal.toObject(), handyman, customer);
  }

  /**
   * Submit diagnostic form
   */
  async submitDiagnostic(dealId, sfId, companyId, diagnosticData) {
    const { Deal, Contact } = await this.initModels(companyId);

    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      throw new Error('Contact not found or not a handyman');
    }

    const deal = await this.findDealByIdOrSfId(Deal, dealId);
    if (!deal) {
      throw new Error('Job not found');
    }

    if (deal.details?.Handyman !== handyman.SF_id) {
      throw new Error('Access denied');
    }

    const currentVisit = this.getCurrentVisitNumber(deal);
    if (!deal.details) deal.details = {};

    // Process and store materials in Salesforce format
    const materialsText = this.formatMaterialsForSalesforce(diagnosticData.materials || []);
    const materialCosts = this.calculateMaterialCosts(diagnosticData.materials || []);

    // Store diagnostic data in internal format
    const diagnosticField = `Diagnostic_${currentVisit}`;
    // Merge photosBefore: keep any already added via /upload, add new URLs from diagnostic
    const existingPhotos = deal.details[diagnosticField]?.photosBefore || [];
    const newPhotos = Array.isArray(diagnosticData.photosBefore) ? diagnosticData.photosBefore : [];
    const photosBefore = [...existingPhotos, ...newPhotos].filter(Boolean);
    deal.details[diagnosticField] = {
      estimatedWorkTime: diagnosticData.estimatedWorkTime,
      kilometersPerVisit: diagnosticData.kilometersPerVisit || 0,
      estimatedVisits: diagnosticData.estimatedVisits || 1,
      materials: diagnosticData.materials || [],
      photosBefore,
      reasonForNextVisit: diagnosticData.reasonForNextVisit,
      materialPurchaseHours: diagnosticData.materialPurchaseHours || 0,
      complexPriceCalculation: diagnosticData.complexPriceCalculation || false,
      submittedAt: new Date().toISOString(),
      // Protocol / repair fields (HM app)
      repairSubject: diagnosticData.repairSubject,
      problemDescription: diagnosticData.problemDescription,
      solutionProposal: diagnosticData.solutionProposal,
      visitLocation: diagnosticData.visitLocation,
      visitDate: diagnosticData.visitDate,
      technicianArrivalTime: diagnosticData.technicianArrivalTime,
      technicianDepartureTime: diagnosticData.technicianDepartureTime,
      fullName: diagnosticData.fullName,
      phone: diagnosticData.phone,
      address: diagnosticData.address,
      customerSignature: diagnosticData.customerSignature ?? null,
    };

    setDetail(deal.details, SF.Popis_a_cena_materialu_z_HM_APP__c, materialsText);
    setDetail(deal.details, SF.X1_Cena_za_drobny_material_hm__c, materialCosts.smallMaterials);
    setDetail(deal.details, SF.X1_Cena_za_nahradne_diely_a_material_hm__c, materialCosts.spareParts);

    if (diagnosticData.repairSubject != null) setDetail(deal.details, SF.Repair_Subject__c, diagnosticData.repairSubject);
    if (diagnosticData.problemDescription != null) {
      setDetail(deal.details, SF.Work_description__c, diagnosticData.problemDescription);
      setDetail(deal.details, SF.Detailed_repair_description__c, diagnosticData.problemDescription);
    }
    if (diagnosticData.solutionProposal != null) deal.details.Solution_proposal = diagnosticData.solutionProposal;
    if (diagnosticData.visitLocation != null) setDetail(deal.details, SF.Location__c, diagnosticData.visitLocation);
    if (diagnosticData.visitDate != null) setDetail(deal.details, `Date_on_Protocol_${currentVisit}__c`, diagnosticData.visitDate);
    if (diagnosticData.technicianArrivalTime != null) setDetail(deal.details, `Technician_arrival_Time_${currentVisit}__c`, diagnosticData.technicianArrivalTime);
    if (diagnosticData.technicianDepartureTime != null) setDetail(deal.details, `Technician_departure_Time_${currentVisit}__c`, diagnosticData.technicianDepartureTime);
    if (diagnosticData.fullName != null) deal.details.Customer_Full_Name = diagnosticData.fullName;
    if (diagnosticData.phone != null) deal.details.Customer_Phone_Protocol = diagnosticData.phone;
    if (diagnosticData.address != null) deal.details.Customer_Address_Protocol = diagnosticData.address;

    const estimatedVisits = diagnosticData.estimatedVisits || 1;
    // Helper fields in Salesforce for AI/pricing
    setDetail(deal.details, SF.POMOCNY_POCET_VYJAZDOV__c, diagnosticData.estimatedVisits ?? 1);
    setDetail(deal.details, SF.POMOCNY_POCET_HODIN_PRACE__c, diagnosticData.estimatedWorkTime ?? null);
    // Keep legacy X1 fields in sync for backward compatibility
    setDetail(deal.details, SF.X1_Pocet_vyjazdov_hm__c, diagnosticData.estimatedVisits ?? 1);
    setDetail(deal.details, SF.X1_Pocet_hodin_prace_hm__c, diagnosticData.estimatedWorkTime ?? null);
    setDetail(deal.details, SF.X1_Pocet_hodin_nakupu_materialu_hm__c, diagnosticData.materialPurchaseHours ?? 0);
    setDetail(deal.details, SF.Pocet_km_na_1_navstevu__c, diagnosticData.kilometersPerVisit ?? 0);
    if (diagnosticData.reasonForNextVisit) setDetail(deal.details, SF.Dovod_dalsej_navstevy__c, diagnosticData.reasonForNextVisit);

    // Customer signature URL into Salesforce field Suhlassospracovanim__c
    if (diagnosticData.customerSignature) {
      setDetail(deal.details, SF.Suhlassospracovanim__c, diagnosticData.customerSignature);
    }

    deal.status = 'Calculating';
    setDetail(deal.details, 'Status__c', 'Calculating');
    deal.details.Status_After_Diagnostic = 'Submitted';

    deal.markModified('details');
    await deal.save();

    if (deal.deal_id) {
      const sfResult = await SalesforceDealService.syncDiagnostic(deal.toObject ? deal.toObject() : deal, currentVisit);
      if (!sfResult.success) console.warn('⚠️ Salesforce diagnostic sync failed:', sfResult.error);
    }

    // Fetch customer details
    const customerSFId = deal.details?.Customer;
    let customer = null;
    if (customerSFId) {
      customer = await Contact.findOne({ SF_id: customerSFId }).lean();
    }

    // Emit real-time update
    await this.emitJobUpdate(deal, companyId, 'job:diagnostic_submitted');

    // Note: Salesforce updates (e.g. price, work summary) come via bulk-upsert → pending load worker → job:deal_updated to mobile

    return this.formatJobDetailsForMobile(deal.toObject(), handyman, customer);
  }

  /**
   * Update job status
   */
  async updateJobStatus(dealId, sfId, companyId, status, additionalData = {}) {
    const { Deal, Contact } = await this.initModels(companyId);

    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      throw new Error('Contact not found or not a handyman');
    }

    const deal = await this.findDealByIdOrSfId(Deal, dealId);
    if (!deal) {
      throw new Error('Job not found');
    }

    if (deal.details?.Handyman !== handyman.SF_id) {
      throw new Error('Access denied');
    }

    deal.status = status;
    if (!deal.details) deal.details = {};
    setDetail(deal.details, 'Status__c', status);

    // Handle special status transitions
    if (status === 'Diagnostic only (refused)') {
      deal.details.Len_diagnostika = true;
    }

    if (status === 'Waiting for approval') {
      // Set surcharge communication status if needed
      if (!deal.details.Komunikacia_doplatku) {
        deal.details.Komunikacia_doplatku = 'Pending';
      }
    }

    // Update additional fields if provided
    if (additionalData.endTime) {
      const currentVisit = this.getCurrentVisitNumber(deal);
      const endTimeField = `Job_End_Time_${currentVisit}`;
      deal.details[endTimeField] = additionalData.endTime;
    }

    // Update surcharge agreement status if provided
    if (additionalData.surchargeAgreement !== undefined) {
      deal.details.Suhlas_majstra_s_fakturaciou = additionalData.surchargeAgreement ? 'Súhlasím' : 'Nesúhlasím';
    }

    await deal.save();

    // Fetch customer details
    const customerSFId = deal.details?.Customer;
    let customer = null;
    if (customerSFId) {
      customer = await Contact.findOne({ SF_id: customerSFId }).lean();
    }

    // Calculate progress
    const progress = this.calculateProgress(deal);

    // Emit real-time update
    await this.emitJobUpdate(deal, companyId, 'job:status_changed', { status, progress });

    return {
      ...this.formatJobDetailsForMobile(deal.toObject(), handyman, customer),
      progress
    };
  }

  /**
   * Update GPS location
   */
  async updateGPSLocation(dealId, sfId, companyId, gpsData) {
    const { Deal, Contact } = await this.initModels(companyId);

    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      throw new Error('Contact not found or not a handyman');
    }

    const deal = await this.findDealByIdOrSfId(Deal, dealId);
    if (!deal) {
      throw new Error('Job not found');
    }

    if (deal.details?.Handyman !== handyman.SF_id) {
      throw new Error('Access denied');
    }

    const currentVisit = this.getCurrentVisitNumber(deal);
    if (!deal.details) deal.details = {};

    // Update GPS coordinates
    deal.details[`GPS_Current_Lat_${currentVisit}`] = gpsData.latitude;
    deal.details[`GPS_Current_Long_${currentVisit}`] = gpsData.longitude;
    deal.details[`GPS_Last_Update_${currentVisit}`] = new Date().toISOString();

    await deal.save();

    // Emit real-time location update (for office tracking)
    await SocketEmitter.emit(
      `company:${companyId}`,
      'mobile:job:location_update',
      {
        dealId: deal._id.toString(),
        dealName: deal.name,
        handymanSFId: sfId,
        location: { lat: gpsData.latitude, lng: gpsData.longitude },
        timestamp: new Date()
      }
    );

    return { success: true };
  }

  /**
   * Map status to stage format for mobile app compatibility
   */
  mapStatusToStage(status) {
    const statusToStageMap = {
      'Schedule appointment': '01. Dohodnutie termínu',
      'Scheduled': '02. Termín potvrdený',
      'Diagnostic running': '03. Diagnostika',
      'Diagnostic in progress': '03. Diagnostika',
      'Calculating': '04. Výpočet ceny',
      'Waiting for approval': '05. Čakanie na schválenie',
      'Waiting': '05. Čakanie na schválenie',
      'Continue work': '06. Schválené',
      'Protocol creation': '07. Dohoda o príplatku',
      'Protocol signed': '07. Dohoda o príplatku',
      'Invoice process': '08. Fakturácia',
      'Invoice paid': '09. Ukončené',
      'Completed': '09. Ukončené',
      'Cancelled': '10. Zrušené',
    };

    return statusToStageMap[status] || status || '01. Dohodnutie termínu';
  }

  /**
   * Format job for mobile home screen
   * Returns data structure compatible with mobile app components
   */
  formatJobForMobile(deal, handyman, customer = null) {
    const status = (deal.status || getDetail(deal.details, 'Status__c')) ?? deal.details?.Status ?? 'Schedule appointment';
    const progress = this.calculateProgress(deal);
    const stage = this.mapStatusToStage(status);

    // Format appointment date/time
    const appointmentDate = this.getAppointmentDate(deal);
    const appointmentTime = this.getAppointmentTime(deal);

    // Format customer details from Contact collection
    const customerName = customer 
      ? (customer.name || customer.displayName || customer.details?.['Contact Full Name'] || 
         `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown Customer')
      : (deal.details?.Customer_Name || 'Unknown Customer');
    
    const customerPhone = customer 
      ? (customer.phone || customer.details?.['Formatted Phone Number'] || customer.details?.Phone || '')
      : (deal.details?.Customer_Phone || '');
    
    const customerEmail = customer 
      ? (customer.email || customer.details?.Email || '')
      : (deal.details?.Customer_Email || '');
    
    const customerAddress = customer 
      ? (customer.details?.['Home_City_1'] || 
         customer.details?.['Mailing Address'] || 
         customer.details?.['Home Address'] || 
         customer.address || '')
      : (deal.details?.Customer_Address || '');

    return {
      // IDs
      _id: deal._id.toString(),
      id: deal._id.toString(),
      dealId: deal.deal_id || deal._id.toString(),
      deal_id: deal.deal_id || deal._id.toString(),
      
      // Basic info
      name: deal.name || 'Untitled Job',
      stage: stage, // Required by mobile components
      status: status, // Keep original status too
      
      // Progress
      progress: progress.percentage,
      progressColor: progress.color,
      
      // Customer info (legacy fields for backward compatibility)
      customerName: customerName,
      customerPhone: customerPhone,
      customerAddress: customerAddress,
      customerEmail: customerEmail,
      
      // Customer details object (expected by mobile app components)
      customer_details: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        address: customerAddress,
        // Include full customer details object for nested fields like Home_City_1
        details: customer?.details || {},
        // Include customer SF_id for reference
        sfId: customer?.SF_id || deal.details?.Customer || null,
      },
      
      // Appointment
      appointmentDate: appointmentDate,
      appointmentTime: appointmentTime,
      isUnscheduled: !appointmentDate,
      
      // Visit info
      currentVisit: this.getCurrentVisitNumber(deal),
      totalVisits: this.getTotalVisits(deal),
      
      // Details object (required by components). Include both __c (SF) and legacy keys so React Native app needs no changes.
      details: (() => {
        const d = deal.details || {};
        const appointmentDateTime = getDetail(d, SF.Appointment_DateTime__c) ?? d.Appointment_DateTime;
        const statusVal = getDetail(d, 'Status__c') ?? d.Status;
        const jobStart1 = getDetail(d, 'Job_Start_Time_1__c') ?? d.Job_Start_Time_1;
        const jobEnd1 = getDetail(d, 'Job_End_Time_1__c') ?? d.Job_End_Time_1;
        const hmJobEnd = getDetail(d, SF.HM_Job_End_Time__c) ?? d.HM_Job_End_Time;
        const workSummaryApproved = getDetail(d, SF.Schvalenie_FA_majstra__c) === 'Súhlasím' || d.Work_Summary_Approved === true;
        const iFAVal = getDetail(d, SF.iFA__c) ?? d.iFA;
        const eFAVal = getDetail(d, SF.eFA__c) ?? d.eFA;
        return {
          ...d,
          Customer_Name: customerName,
          Customer_Phone: customerPhone,
          Customer_Address: customerAddress,
          Customer_Email: customerEmail,
          Appointment_Date: appointmentDate,
          Appointment_Time: appointmentTime,
          Appointment_DateTime: appointmentDateTime && String(appointmentDateTime).trim() !== '' ? appointmentDateTime : null,
          Handyman_Assigned_DateTime: d.Handyman_Assigned_DateTime || deal.createdAt,
          DEAL_TYPE: d.DEAL_TYPE || 'B2A',
          // Legacy keys for mobile app (no __c) – same values as __c so RN code works unchanged
          Status: statusVal,
          Job_Start_Time_1: jobStart1,
          Job_End_Time_1: jobEnd1,
          HM_Job_End_Time: hmJobEnd,
          Work_Summary_Approved: workSummaryApproved,
          iFA: iFAVal === true || iFAVal === 'true',
          eFA: eFAVal === true || eFAVal === 'true',
          Name: deal.name || d.Name,
        };
      })(),
      
      // Timestamps
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    };
  }

  /**
   * Format job details for mobile
   */
  formatJobDetailsForMobile(deal, handyman, customer = null) {
    const baseJob = this.formatJobForMobile(deal, handyman, customer);
    const currentVisit = this.getCurrentVisitNumber(deal);

    // Get visit timeline
    const visits = this.getVisitTimeline(deal);

    // Format customer details from Contact collection (same as in formatJobForMobile)
    const customerName = customer 
      ? (customer.name || customer.displayName || customer.details?.['Contact Full Name'] || 
         `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || '')
      : (deal.details?.Customer_Name || '');
    
    const customerPhone = customer 
      ? (customer.phone || customer.details?.['Formatted Phone Number'] || customer.details?.Phone || '')
      : (deal.details?.Customer_Phone || '');
    
    const customerEmail = customer 
      ? (customer.email || customer.details?.Email || '')
      : (deal.details?.Customer_Email || '');
    
    const customerAddress = customer 
      ? (customer.details?.['Home_City_1'] || 
         customer.details?.['Mailing Address'] || 
         customer.details?.['Home Address'] || 
         customer.address || '')
      : (deal.details?.Customer_Address || '');

    return {
      ...baseJob,
      visits,
      currentVisit,
      diagnostic: this.getDiagnosticForVisit(deal, currentVisit),
      protocol: this.getProtocolForVisit(deal, currentVisit),
      invoice: this.getInvoiceInfo(deal),
      customerDetails: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        address: customerAddress,
        // Include full customer details object for nested fields
        details: customer?.details || {},
        // Include customer SF_id for reference
        sfId: customer?.SF_id || deal.details?.Customer || null,
      }
    };
  }

  /**
   * Get appointment date from deal
   * Primary: Appointment_DateTime (ISO); fallback: Appointment_Date, Visit_Date, Scheduled_Date
   */
  getAppointmentDate(deal) {
    const dt = getDetail(deal.details, SF.Appointment_DateTime__c) ?? deal.details?.Appointment_DateTime;
    if (dt && typeof dt === 'string' && dt.trim() !== '') {
      const d = new Date(dt);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return deal.details?.Appointment_Date ||
           deal.details?.Visit_Date ||
           deal.details?.Scheduled_Date ||
           null;
  }

  /**
   * Get appointment time from deal
   * Primary: parse from Appointment_DateTime; fallback: Appointment_Time, Visit_Time, Scheduled_Time
   */
  getAppointmentTime(deal) {
    const dt = getDetail(deal.details, SF.Appointment_DateTime__c) ?? deal.details?.Appointment_DateTime;
    if (dt && typeof dt === 'string' && dt.trim() !== '') {
      const d = new Date(dt);
      if (!isNaN(d.getTime())) {
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
      }
    }
    return deal.details?.Appointment_Time ||
           deal.details?.Visit_Time ||
           deal.details?.Scheduled_Time ||
           null;
  }

  /**
   * Get current visit number
   */
  getCurrentVisitNumber(deal) {
    // Check which visit is currently active
    for (let i = 1; i <= 5; i++) {
      const status = deal.details?.[`Visit_${i}_Status`];
      if (status === 'In Progress' || status === 'Active') {
        return i;
      }
    }
    // If no active visit, return first incomplete visit
    for (let i = 1; i <= 5; i++) {
      const status = deal.details?.[`Visit_${i}_Status`];
      if (!status || status === 'Planned' || status === 'Scheduled') {
        return i;
      }
    }
    return 1; // Default to visit 1
  }

  /**
   * Get total planned visits
   */
  getTotalVisits(deal) {
    const n = getDetail(deal.details, SF.X1_Pocet_vyjazdov_hm__c) ?? deal.details?.Total_Visits_Planned;
    return n != null ? Number(n) : 1;
  }

  /**
   * Get visit timeline
   */
  getVisitTimeline(deal) {
    const visits = [];
    const totalVisits = this.getTotalVisits(deal);
    const details = deal.details || {};

    for (let i = 1; i <= totalVisits; i++) {
      const startTime = getDetail(details, `Job_Start_Time_${i}__c`) ?? details[`Job_Start_Time_${i}`];
      const endTime = getDetail(details, `Job_End_Time_${i}__c`) ?? details[`Job_End_Time_${i}`];
      const visit = {
        number: i,
        date: details[`Visit_${i}_Date`] ?? null,
        status: details[`Visit_${i}_Status`] ?? 'Planned',
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        description: details[`Visit_${i}_Description`] ?? null
      };
      visits.push(visit);
    }

    return visits;
  }

  /**
   * Get diagnostic for visit
   */
  getDiagnosticForVisit(deal, visitNumber) {
    return deal.details?.[`Diagnostic_${visitNumber}`] || null;
  }

  /**
   * Get protocol for visit
   */
  getProtocolForVisit(deal, visitNumber) {
    return deal.details?.[`Protocol_Link_${visitNumber}`] || null;
  }

  /**
   * Get invoice info
   */
  getInvoiceInfo(deal) {
    return {
      status: deal.details?.Invoice_Status || null,
      amount: deal.details?.Invoice_Amount || null,
      link: deal.details?.Invoice_Link || null
    };
  }

  /**
   * Calculate progress percentage based on status
   */
  calculateProgress(deal) {
    const status = (deal.status || getDetail(deal.details, 'Status__c')) ?? deal.details?.Status ?? 'Schedule appointment';

    const statusProgressMap = {
      'Schedule appointment': { percentage: 0, color: 'gray' },
      'Scheduled': { percentage: 10, color: 'green' },
      'Diagnostic running': { percentage: 25, color: 'green' },
      'Calculating': { percentage: 35, color: 'green' },
      'Continue work': { percentage: 50, color: 'green' },
      'Protocol creation': { percentage: 70, color: 'green' },
      'Protocol signed': { percentage: 80, color: 'green' },
      'Invoice process': { percentage: 90, color: 'green' },
      'Invoice paid': { percentage: 100, color: 'green' },
      'Cancelled': { percentage: 100, color: 'red' },
      'Waiting for approval': { percentage: 35, color: 'orange', pulse: true },
      'Waiting': { percentage: 35, color: 'orange', pulse: true }
    };

    let progress = statusProgressMap[status] || { percentage: 0, color: 'gray' };

    // Adjust for multi-visit jobs
    const totalVisits = this.getTotalVisits(deal);
    if (totalVisits > 1) {
      const completedVisits = this.getCompletedVisitsCount(deal);
      const visitProgress = (completedVisits / totalVisits) * 70; // Visits contribute 70%
      const statusProgress = progress.percentage * 0.3; // Status contributes 30%
      progress.percentage = Math.round(visitProgress + statusProgress);
    }

    return progress;
  }

  /**
   * Get completed visits count
   */
  getCompletedVisitsCount(deal) {
    let count = 0;
    for (let i = 1; i <= 5; i++) {
      const status = deal.details?.[`Visit_${i}_Status`];
      if (status === 'Completed') {
        count++;
      }
    }
    return count;
  }

  /**
   * Calculate distance between GPS coordinates and address
   * Uses Haversine formula for distance calculation
   * Note: For production, integrate with geocoding service to convert address to coordinates
   */
  calculateDistance(lat1, lon1, address) {
    // If address contains coordinates, use them
    // Otherwise, would need geocoding service
    // For now, return 0 if address is not provided or doesn't contain coordinates
    if (!address) return 0;

    // Try to extract coordinates from address if they exist
    const coordMatch = address.match(/lat[:\s]*([-\d.]+)[,\s]+lng[:\s]*([-\d.]+)/i);
    if (coordMatch) {
      const lat2 = parseFloat(coordMatch[1]);
      const lon2 = parseFloat(coordMatch[2]);
      return this.haversineDistance(lat1, lon1, lat2, lon2);
    }

    // If no coordinates in address, would need geocoding
    // For now, return 0 (no distance validation)
    return 0;
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * Returns distance in meters
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  /**
   * Convert degrees to radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Format materials array into Salesforce text field format.
   * Accepts app format: { name, quantity, price } or { description, price, vatIncluded }.
   */
  formatMaterialsForSalesforce(materials) {
    if (!materials || materials.length === 0) return '';
    
    return materials.map(material => {
      const desc = material.description || material.name || '';
      const qty = material.quantity != null ? Number(material.quantity) : 1;
      const unitPrice = parseFloat(material.price) || 0;
      const lineTotal = qty * unitPrice;
      const vat = material.vatIncluded ? 'VAT included' : 'VAT excluded';
      if (qty !== 1) {
        return `${desc} - ${qty} x ${unitPrice} EUR = ${lineTotal.toFixed(2)} EUR (${vat})`;
      }
      return `${desc} - ${lineTotal} EUR (${vat})`;
    }).join('\n');
  }

  /**
   * Calculate material costs (basic calculation before AI categorization).
   * Supports app format: { name, quantity, price }.
   */
  calculateMaterialCosts(materials) {
    if (!materials || materials.length === 0) {
      return { smallMaterials: 0, spareParts: 0, total: 0 };
    }

    let total = 0;
    materials.forEach(material => {
      const qty = material.quantity != null ? Number(material.quantity) : 1;
      const price = parseFloat(material.price) || 0;
      total += qty * price;
    });

    // Basic categorization (AI will refine this)
    const smallMaterials = materials
      .filter(m => m.category === 'small' || m.category === 'drobný materiál')
      .reduce((sum, m) => {
        const qty = m.quantity != null ? Number(m.quantity) : 1;
        return sum + (parseFloat(m.price) || 0) * qty;
      }, 0);
    
    const spareParts = total - smallMaterials;

    return {
      smallMaterials: Math.round(smallMaterials * 100) / 100,
      spareParts: Math.round(spareParts * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  /**
   * Update visit history (Historia_navstev field)
   */
  updateVisitHistory(deal, visitNumber, startTime, endTime, durationMinutes, workDescription) {
    if (!deal.details) deal.details = {};
    
    const visitDate = startTime ? new Date(startTime).toLocaleDateString('sk-SK') : new Date().toLocaleDateString('sk-SK');
    const durationHours = durationMinutes ? (durationMinutes / 60).toFixed(1) : '0';
    const workDone = workDescription || 'Work completed';
    
    const visitEntry = `Visit ${visitNumber}: ${visitDate} - ${durationHours}h - ${workDone}`;
    
    // Get existing history or initialize
    let history = deal.details.Historia_navstev || '';
    
    // Check if this visit already has an entry
    const visitPattern = new RegExp(`Visit ${visitNumber}:.*`, 'g');
    if (visitPattern.test(history)) {
      // Replace existing entry
      history = history.replace(visitPattern, visitEntry);
    } else {
      // Append new entry
      history = history ? `${history}\n${visitEntry}` : visitEntry;
    }
    
    deal.details.Historia_navstev = history;
  }

  /**
   * Emit job update via socket
   */
  async emitJobUpdate(deal, companyId, eventType, additionalData = {}) {
    const handymanSFId = deal.details?.Handyman;
    if (!handymanSFId) return;

    // Find handyman contact by SF_id
    const { Contact } = await this.initModels(companyId);
    const handyman = await Contact.findOne({ SF_id: handymanSFId }).lean();
    if (!handyman) return;

    // Fetch customer details
    const customerSFId = deal.details?.Customer;
    let customer = null;
    if (customerSFId) {
      customer = await Contact.findOne({ SF_id: customerSFId }).lean();
    }

    const jobData = this.formatJobForMobile(deal, handyman, customer);

    // Emit to handyman's room (using SF_id)
    await SocketEmitter.emit(
      `mobile:handyman:${handymanSFId}`,
      eventType,
      {
        job: jobData,
        ...additionalData,
        timestamp: new Date()
      }
    );

    // Also emit to company room for office tracking
    await SocketEmitter.emit(
      `company:${companyId}`,
      'mobile:job:update',
      {
        dealId: deal._id.toString(),
        job: jobData,
        ...additionalData,
        timestamp: new Date()
      }
    );
  }
}

export default new MobileJobService();

