// src/services/salesforce/salesforceDealFields.js
/**
 * Salesforce Deal__c API field names (__c suffix) for PATCH requests only.
 * In our DB (deal.details) we store the same fields WITHOUT __c; when syncing to SF we add __c.
 */

export const SF = {
  // Schedule
  Appointment_DateTime__c: 'Appointment_DateTime__c',
  Planned_DateTime__c: 'Planned_DateTime__c',
  // Start work
  Job_Start_Time_1__c: 'Job_Start_Time_1__c',
  Job_Start_Time_2__c: 'Job_Start_Time_2__c',
  Job_Start_Time_3__c: 'Job_Start_Time_3__c',
  Job_Start_Time_4__c: 'Job_Start_Time_4__c',
  Job_Start_Time_5__c: 'Job_Start_Time_5__c',
  GPS_Start_Latitude__c: 'GPS_Start_Latitude__c',
  GPS_Start_Longitude__c: 'GPS_Start_Longitude__c',
  GPS_End_Latitude__c: 'GPS_End_Latitude__c',
  GPS_End_Longitude__c: 'GPS_End_Longitude__c',
  GPS_Distance_From_Customer__c: 'GPS_Distance_From_Customer__c',
  // Diagnostic / materials (Slovak: 1 Pocet vyjazdov (hm) -> X1_Pocet_vyjazdov_hm__c, etc.)
  Popis_a_cena_materialu_z_HM_APP__c: 'Popis_a_cena_materialu_z_HM_APP__c',
  X1_Cena_za_drobny_material_hm__c: 'X1_Cena_za_drobny_material_hm__c',
  X1_Cena_za_nahradne_diely_a_material_hm__c: 'X1_Cena_za_nahradne_diely_a_material_hm__c',
  X1_Cena_za_pracu_hm__c: 'X1_Cena_za_pracu_hm__c',
  X1_Pocet_hodin_prace_hm__c: 'X1_Pocet_hodin_prace_hm__c',
  X1_Pocet_vyjazdov_hm__c: 'X1_Pocet_vyjazdov_hm__c',
  X1_Pocet_hodin_nakupu_materialu_hm__c: 'X1_Pocet_hodin_nakupu_materialu_hm__c',
  X1_Cena_dopravy_hm__c: 'X1_Cena_dopravy_hm__c',
  POMOCNY_POCET_HODIN_PRACE__c: 'POMOCNY_POCET_HODIN_PRACE__c',
  POMOCNY_POCET_VYJAZDOV__c: 'POMOCNY_POCET_VYJAZDOV__c',
  Pocet_km_na_1_navstevu__c: 'Pocet_km_na_1_navstevu__c',
  Po_et_km_na_1_vyjazde_spolu_oba_smery__c: 'Po_et_km_na_1_vyjazde_spolu_oba_smery__c',
  Dovod_dalsej_navstevy__c: 'Dovod_dalsej_navstevy__c',
  Repair_Subject__c: 'Repair_Subject__c',
  Work_description__c: 'Work_description__c',
  Detailed_repair_description__c: 'Detailed_repair_description__c',
  Location__c: 'Location__c',
  Date_on_Protocol_1__c: 'Date_on_Protocol_1__c',
  Date_on_Protocol_2__c: 'Date_on_Protocol_2__c',
  Date_on_Protocol_3__c: 'Date_on_Protocol_3__c',
  Date_on_Protocol_4__c: 'Date_on_Protocol_4__c',
  Date_on_Protocol_5__c: 'Date_on_Protocol_5__c',
  Technician_arrival_Time_1__c: 'Technician_arrival_Time_1__c',
  Technician_arrival_Time_2__c: 'Technician_arrival_Time_2__c',
  Technician_arrival_Time_3__c: 'Technician_arrival_Time_3__c',
  Technician_arrival_Time_4__c: 'Technician_arrival_Time_4__c',
  Technician_arrival_Time_5__c: 'Technician_arrival_Time_5__c',
  Technician_departure_Time_1__c: 'Technician_departure_Time_1__c',
  Technician_departure_Time_2__c: 'Technician_departure_Time_2__c',
  Technician_departure_Time_3__c: 'Technician_departure_Time_3__c',
  Technician_departure_Time_4__c: 'Technician_departure_Time_4__c',
  Technician_departure_Time_5__c: 'Technician_departure_Time_5__c',
  // Price / repair complete
  HM_End_Price_Check__c: 'HM_End_Price_Check__c',
  Job_End_Time_1__c: 'Job_End_Time_1__c',
  Job_End_Time_2__c: 'Job_End_Time_2__c',
  Job_End_Time_3__c: 'Job_End_Time_3__c',
  Job_End_Time_4__c: 'Job_End_Time_4__c',
  Job_End_Time_5__c: 'Job_End_Time_5__c',
  HM_Job_End_Time__c: 'HM_Job_End_Time__c',
  After_Job_Info__c: 'After_Job_Info__c',
  Pictures_of_work__c: 'Pictures_of_work__c',
  HM_Files_uploaded__c: 'HM_Files_uploaded__c',
  Protocol_Email_To_Handyman__c: 'Protocol_Email_To_Handyman__c',
  // Surcharge / diagnostic-only notes
  Dovod__c: 'Dovod__c',
  Poznamka_m__c: 'Poznamka_m__c',
  C_Feedback__c: 'C_Feedback__c',
  // Work summary
  Reason_for_Diagreement__c: 'Reason_for_Diagreement__c',
  Schvalenie_FA_majstra__c: 'Schvalenie_FA_majstra__c',
  Suhlassospracovanim__c: 'Suhlassospracovanim__c',
  // Invoice
  iFA__c: 'iFA__c',
  eFA__c: 'eFA__c',
  Celkova_suma_bez_DPH_efa__c: 'Celkova_suma_bez_DPH_efa__c',
  EFA_DPH__c: 'EFA_DPH__c',
  Datum_dodania_efa__c: 'Datum_dodania_efa__c',
  VS_efa__c: 'VS_efa__c',
};

/** Deal workflow status is local-only: store in deal.details.Status; do not send to Salesforce (SF uses won/lost/pending). */

/** Key for DB storage: strip __c so deal.details keeps fields without suffix. */
export function detailKeyForDb(sfFieldName) {
  if (!sfFieldName || typeof sfFieldName !== 'string') return sfFieldName;
  return sfFieldName.replace(/__c$/, '') || sfFieldName;
}

/**
 * Get value from deal.details. We store without __c, so read DB key first, then __c for backward compat.
 */
export function getDetail(details, sfFieldName) {
  if (!details || !sfFieldName) return undefined;
  const dbKey = detailKeyForDb(sfFieldName);
  const fromDb = details[dbKey];
  if (fromDb !== undefined && fromDb !== null) return fromDb;
  if (dbKey !== sfFieldName) return details[sfFieldName];
  return undefined;
}

/**
 * Set value in deal.details. Store without __c (DB format).
 */
export function setDetail(details, sfFieldName, value) {
  if (!details) return;
  details[detailKeyForDb(sfFieldName)] = value;
}
