/**
 * Starter catalogue — GENERIC platform taxonomy only.
 *
 * What this contains: industries, rice-mill process stages, disciplines,
 * equipment categories, generic machine types, generic components, reported
 * problem types and service skills, with common English aliases.
 *
 * What this deliberately does NOT contain: manufacturers, product families,
 * models, controllers or spare-part numbers. Those must come from researched,
 * cited sources (docs/catalogue-research-worklist.md) and cannot be approved
 * without one (database rule). No model numbers are invented here.
 *
 * Every record carries a `platform_taxonomy` source marked for review by a
 * practising technician, and is imported as `pending_review` — a platform
 * admin approves it in the admin portal before users can see it.
 *
 * Edit this file, then run:  npm run catalogue:build
 */

const RESEARCH_DATE = '2026-11-22';

const TAXONOMY_SOURCE = {
  source_type: 'platform_taxonomy',
  source_org: 'Platform catalogue team',
  research_date: RESEARCH_DATE,
  confidence: 'medium',
  notes: 'Generic term compiled by the platform for navigation and matching. Needs review by a practising industrial / rice-mill technician.',
};

const rows = [];
const add = (kind, key, name, extra = {}) => {
  rows.push({ key, kind, name, verification_status: 'unverified', confidence: 'medium', sources: [TAXONOMY_SOURCE], ...extra });
};
const links = (...pairs) => pairs.flatMap(([relation, targets]) => [].concat(targets).map((to) => ({ relation, to })));

// ----------------------------------------------------------------- industries
const INDUSTRIES = [
  ['rice_mill', 'Rice milling', ['rice mill', 'paddy processing', 'rice processing', 'paddy mill'], 'Paddy-to-rice processing: cleaning, parboiling, drying, husking, whitening, polishing, grading, sorting and packing.'],
  ['food_processing', 'Food processing', ['food industry', 'food manufacturing']],
  ['packaging', 'Packaging', ['packing industry']],
  ['plastics_rubber', 'Plastics and rubber', ['plastic industry', 'rubber industry', 'polymer processing']],
  ['textile', 'Textiles', ['textile mill', 'spinning mill', 'weaving']],
  ['printing', 'Printing', ['printing press', 'print shop']],
  ['engineering', 'Engineering and fabrication', ['general manufacturing', 'machine shop', 'fabrication shop', 'workshop']],
  ['water_treatment', 'Water and wastewater treatment', ['water treatment', 'effluent treatment']],
  ['general', 'Any industry', ['all industries', 'general'], 'Equipment found across many industries (motors, pumps, compressors, panels, utilities).', { is_generic: true }],
];
INDUSTRIES.forEach(([slug, name, aliases, description, extra], i) =>
  add('industry', `industry.${slug}`, name, { aliases, description, sort_order: i + 1, ...(extra ?? {}) }),
);

// ----------------------------------------------------------------- rice-mill process stages (15)
const STAGES = [
  ['receiving', 'Paddy receiving and handling', ['paddy intake', 'unloading', 'raw paddy handling']],
  ['cleaning', 'Cleaning and pre-cleaning', ['pre cleaning', 'paddy cleaning']],
  ['destoning', 'Destoning', ['stone removal']],
  ['drying', 'Drying', ['paddy drying']],
  ['parboiling', 'Parboiling', ['soaking and steaming', 'boiled rice processing']],
  ['husking', 'Husking and dehusking', ['shelling', 'hulling', 'dehusking']],
  ['separation', 'Paddy separation', ['brown rice separation']],
  ['whitening', 'Whitening', ['bran removal', 'milling']],
  ['polishing', 'Polishing', ['silky polishing', 'water polishing']],
  ['grading', 'Grading', ['sizing', 'broken rice separation']],
  ['colour_sorting', 'Colour sorting', ['color sorting', 'optical sorting']],
  ['packing', 'Packing', ['bagging', 'packaging']],
  ['laboratory', 'Laboratory testing', ['quality testing', 'lab']],
  ['air_utility', 'Air and utility systems', ['compressed air', 'utilities', 'dust collection']],
  ['electrical_automation', 'Electrical and automation systems', ['electricals', 'controls', 'automation']],
];
STAGES.forEach(([slug, name, aliases], i) =>
  add('process_stage', `stage.rice_mill.${slug}`, name, { aliases, sort_order: i + 1, links: links(['stage_of', 'industry.rice_mill']) }),
);
const stage = (slug) => `stage.rice_mill.${slug}`;

// ----------------------------------------------------------------- disciplines
const DISCIPLINES = [
  ['mechanical', 'Mechanical', ['mechanical maintenance']],
  ['electrical', 'Electrical', ['electrical maintenance']],
  ['automation', 'Automation and controls', ['controls', 'automation']],
  ['instrumentation', 'Instrumentation and measurement', ['instrumentation', 'C&I']],
  ['fluid_power', 'Hydraulics and pneumatics', ['fluid power']],
  ['thermal', 'Thermal and utilities', ['steam', 'heating', 'cooling']],
  ['fabrication', 'Welding and fabrication', ['fabrication', 'welding']],
];
DISCIPLINES.forEach(([slug, name, aliases], i) => add('discipline', `discipline.${slug}`, name, { aliases, sort_order: i + 1 }));

// ----------------------------------------------------------------- equipment categories (21 + grain)
const CATEGORIES = [
  ['machine_tools', 'Machine tools', ['mechanical'], ['conventional machines']],
  ['cnc_machines', 'CNC machines', ['mechanical', 'automation'], ['CNC']],
  ['electrical_equipment', 'Electrical equipment', ['electrical'], ['electricals']],
  ['industrial_automation', 'Industrial automation', ['automation'], ['automation systems']],
  ['plc_hmi_scada', 'PLC, HMI and SCADA', ['automation'], ['PLC', 'HMI', 'SCADA', 'control systems']],
  ['motors_drives', 'Motors and drives', ['electrical', 'mechanical'], ['drives', 'power transmission']],
  ['pumps_compressors', 'Pumps and compressors', ['mechanical'], ['pumps', 'compressors']],
  ['hydraulic_pneumatic', 'Hydraulic and pneumatic equipment', ['fluid_power'], ['hydraulics', 'pneumatics']],
  ['material_handling', 'Material handling', ['mechanical'], ['conveying', 'lifting']],
  ['boilers_furnaces', 'Boilers and furnaces', ['thermal'], ['boilers', 'furnaces', 'heaters']],
  ['cooling_towers_chillers', 'Cooling towers and chillers', ['thermal'], ['cooling', 'chillers']],
  ['food_processing_equipment', 'Food processing equipment', ['mechanical'], ['food machinery']],
  ['packaging_machinery', 'Packaging machinery', ['mechanical', 'automation'], ['packing machines']],
  ['plastics_rubber_machinery', 'Plastics and rubber machinery', ['mechanical', 'thermal'], ['plastic machines', 'moulding machines']],
  ['textile_machinery', 'Textile machinery', ['mechanical'], ['textile machines']],
  ['printing_machinery', 'Printing machinery', ['mechanical'], ['printing machines']],
  ['welding_fabrication', 'Welding and fabrication equipment', ['fabrication'], ['welding machines']],
  ['instrumentation', 'Instrumentation', ['instrumentation'], ['instruments', 'sensors', 'transmitters']],
  ['testing_equipment', 'Testing and laboratory equipment', ['instrumentation'], ['test equipment', 'lab equipment']],
  ['water_treatment_equipment', 'Water treatment equipment', ['mechanical'], ['water treatment plant']],
  ['industrial_utilities', 'Industrial utilities', ['thermal', 'electrical'], ['utilities']],
  ['grain_processing', 'Grain and rice milling machinery', ['mechanical'], ['rice mill machinery', 'grain milling machinery']],
];
CATEGORIES.forEach(([slug, name, disciplines, aliases], i) =>
  add('equipment_category', `category.${slug}`, name, {
    aliases,
    sort_order: i + 1,
    links: links(['in_discipline', disciplines.map((d) => `discipline.${d}`)]),
  }),
);
const cat = (slug) => `category.${slug}`;
const ind = (slug) => `industry.${slug}`;

// ----------------------------------------------------------------- components (generic)
const COMPONENTS = [
  ['bearing', 'Bearing', ['ball bearing', 'roller bearing', 'plummer block']],
  ['v_belt', 'V-belt', ['belt', 'drive belt']],
  ['shaft_coupling', 'Shaft coupling', ['coupling']],
  ['gears', 'Gears', ['gear set', 'gear wheel']],
  ['oil_seal', 'Oil seal', ['seal']],
  ['rubber_roll', 'Rubber roll', ['husker roll', 'rubber roller', 'sheller roll']],
  ['whitening_stone', 'Whitening stone', ['emery stone', 'abrasive stone', 'grinding stone']],
  ['sieve_screen', 'Sieve / screen', ['screen', 'mesh', 'perforated sheet', 'sieve']],
  ['separator_tray', 'Separator tray', ['separator deck', 'tray']],
  ['spray_nozzle', 'Spray / mist nozzle', ['water nozzle', 'mist nozzle']],
  ['elevator_bucket', 'Elevator bucket', ['bucket']],
  ['conveyor_belt', 'Conveyor belt', ['elevator belt']],
  ['idler_roller', 'Conveyor roller / idler', ['idler', 'roller']],
  ['ejector_valve', 'Ejector valve', ['ejector', 'air ejector']],
  ['optical_sensor', 'Camera / optical sensor', ['CCD camera', 'camera', 'optical sensor']],
  ['air_filter', 'Air filter', ['filter element']],
  ['contactor', 'Contactor', ['starter contactor']],
  ['circuit_breaker', 'Circuit breaker (MCB / MCCB)', ['MCB', 'MCCB', 'breaker']],
  ['overload_relay', 'Overload relay', ['OLR', 'thermal overload']],
  ['motor_winding', 'Motor winding', ['winding', 'stator winding', 'coil']],
  ['impeller', 'Impeller', ['pump impeller', 'fan impeller']],
  ['mechanical_seal', 'Mechanical seal', ['pump seal', 'gland']],
  ['hydraulic_pump', 'Hydraulic pump', ['gear pump', 'vane pump', 'piston pump']],
  ['solenoid_valve', 'Solenoid valve', ['directional valve', 'DC valve']],
  ['spindle', 'Spindle', ['machine spindle']],
  ['ball_screw', 'Ball screw', ['lead screw']],
  ['servo_motor', 'Servo motor', ['servo']],
  ['encoder', 'Encoder', ['rotary encoder']],
  ['plc_cpu', 'PLC CPU module', ['CPU', 'processor module']],
  ['plc_io_module', 'PLC I/O module', ['IO card', 'input output module']],
  ['load_cell', 'Load cell', ['weighing sensor']],
  ['safety_valve', 'Safety valve', ['pressure relief valve', 'PRV']],
  ['pressure_gauge', 'Pressure gauge', ['gauge']],
  ['pressure_switch', 'Pressure switch', ['pressure cut-off']],
  ['temperature_sensor', 'Temperature sensor (thermocouple / RTD)', ['thermocouple', 'RTD', 'PT100']],
  ['heating_element', 'Heating element', ['heater', 'heater band']],
  ['furnace_grate', 'Furnace grate', ['grate', 'husk furnace grate']],
];
COMPONENTS.forEach(([slug, name, aliases], i) => add('component', `component.${slug}`, name, { aliases, sort_order: i + 1 }));
const comp = (slug) => `component.${slug}`;

// ----------------------------------------------------------------- machine types
// [slug, name, aliases, usedIn (stage/industry keys), categories, components, extra]
const MACHINES = [
  // --- rice mill line
  ['paddy_cleaner', 'Paddy cleaner', ['pre-cleaner', 'paddy pre-cleaner', 'paddy cleaning machine', 'drum cleaner', 'vibro cleaner'], [stage('cleaning'), stage('receiving')], ['grain_processing'], ['sieve_screen', 'bearing']],
  ['destoner', 'Destoner', ['de-stoner', 'stone separator', 'gravity destoner', 'stoner'], [stage('destoning')], ['grain_processing'], ['sieve_screen', 'bearing']],
  ['paddy_dryer', 'Paddy dryer', ['grain dryer', 'paddy drier', 'LSU dryer', 'recirculating dryer'], [stage('drying')], ['grain_processing'], ['temperature_sensor', 'bearing']],
  ['parboiling_unit', 'Parboiling plant (soaking and steaming)', ['parboiling tank', 'soaking tank', 'steaming vessel', 'parboiling unit'], [stage('parboiling')], ['grain_processing'], ['pressure_gauge', 'safety_valve'], { description: 'Soaking and steaming equipment. If steam is supplied from a boiler, boiler rules apply to the boiler.' }],
  ['rubber_roll_husker', 'Rubber roll husker', ['husker', 'dehusker', 'sheller', 'paddy sheller', 'huller', 'rubber roll sheller', 'paddy husker'], [stage('husking')], ['grain_processing'], ['rubber_roll', 'bearing', 'v_belt']],
  ['husk_aspirator', 'Husk aspirator', ['aspirator', 'husk separator'], [stage('husking')], ['grain_processing'], ['impeller', 'bearing']],
  ['paddy_separator', 'Paddy separator', ['tray separator', 'compartment separator', 'gravity separator', 'paddy brown rice separator'], [stage('separation')], ['grain_processing'], ['separator_tray', 'bearing']],
  ['rice_whitener', 'Rice whitener', ['whitening machine', 'abrasive whitener', 'friction whitener', 'stone whitener', 'vertical whitener', 'cone whitener'], [stage('whitening')], ['grain_processing'], ['whitening_stone', 'sieve_screen', 'bearing', 'v_belt']],
  ['rice_polisher', 'Rice polisher', ['silky polisher', 'water polisher', 'mist polisher', 'rice polishing machine'], [stage('polishing')], ['grain_processing'], ['sieve_screen', 'spray_nozzle', 'bearing']],
  ['rotary_sifter', 'Rotary sifter', ['rotary grader', 'sieve grader', 'rice grader', 'sifter'], [stage('grading')], ['grain_processing'], ['sieve_screen', 'bearing']],
  ['thickness_grader', 'Thickness grader', ['rotary thickness grader', 'thickness grading machine'], [stage('grading')], ['grain_processing'], ['sieve_screen', 'bearing']],
  ['length_grader', 'Length grader', ['indented cylinder', 'trieur', 'cylinder grader', 'length grading machine'], [stage('grading')], ['grain_processing'], ['bearing']],
  ['colour_sorter', 'Colour sorter', ['color sorter', 'optical sorter', 'rice sorter', 'colour sorting machine'], [stage('colour_sorting')], ['grain_processing'], ['ejector_valve', 'optical_sensor', 'air_filter']],
  ['packing_machine', 'Packing machine', ['bagging machine', 'weighing and packing machine', 'auto packer', 'rice packing machine'], [stage('packing'), ind('packaging'), ind('food_processing')], ['packaging_machinery'], ['load_cell']],
  ['bag_closer', 'Bag closing machine', ['bag stitching machine', 'bag sewing machine', 'bag closer'], [stage('packing'), ind('packaging')], ['packaging_machinery'], []],
  ['moisture_meter', 'Grain moisture meter', ['moisture meter', 'moisture tester'], [stage('laboratory')], ['testing_equipment'], []],
  ['weighbridge', 'Weighbridge', ['weigh bridge', 'truck scale'], [stage('receiving'), ind('general')], ['instrumentation'], ['load_cell']],
  ['bucket_elevator', 'Bucket elevator', ['elevator', 'grain elevator'], [stage('receiving'), stage('husking'), stage('whitening'), stage('grading'), stage('packing'), ind('general')], ['material_handling'], ['elevator_bucket', 'conveyor_belt', 'bearing']],
  ['belt_conveyor', 'Belt conveyor', ['conveyor', 'conveyor belt system'], [stage('receiving'), stage('packing'), ind('general')], ['material_handling'], ['conveyor_belt', 'idler_roller', 'bearing']],
  ['screw_conveyor', 'Screw conveyor', ['auger conveyor', 'worm conveyor', 'auger'], [stage('receiving'), stage('drying'), ind('general')], ['material_handling'], ['bearing', 'shaft_coupling']],
  ['air_compressor', 'Air compressor', ['compressor', 'screw compressor', 'reciprocating compressor', 'piston compressor'], [stage('air_utility'), ind('general')], ['pumps_compressors', 'industrial_utilities'], ['air_filter', 'pressure_switch', 'safety_valve']],
  ['air_dryer', 'Compressed air dryer', ['air dryer', 'refrigerated air dryer'], [stage('air_utility'), ind('general')], ['industrial_utilities'], []],
  ['air_receiver', 'Air receiver tank', ['air receiver', 'compressed air tank'], [stage('air_utility'), ind('general')], ['industrial_utilities', 'pumps_compressors'], ['safety_valve', 'pressure_gauge'], { regulated_work: 'pressure_vessel', regulated_note: 'Pressure vessels may need periodic statutory testing and inspection.' }],
  ['cyclone_dust_collector', 'Cyclone dust collector', ['cyclone', 'dust collector'], [stage('air_utility'), ind('general')], ['industrial_utilities'], []],
  ['industrial_fan', 'Industrial blower / fan', ['blower', 'fan', 'centrifugal fan'], [stage('air_utility'), stage('husking'), ind('general')], ['industrial_utilities'], ['impeller', 'bearing']],
  ['boiler', 'Boiler', ['steam boiler', 'husk-fired boiler', 'husk boiler'], [stage('parboiling'), ind('general')], ['boilers_furnaces'], ['safety_valve', 'pressure_gauge', 'furnace_grate'], { regulated_work: 'boiler', regulated_note: 'Boiler repairs and alterations may need an approved boiler repairer and inspection under the boiler law in force.' }],
  ['electric_motor', 'Electric motor', ['motor', 'induction motor', 'AC motor', 'three phase motor'], [stage('electrical_automation'), ind('general')], ['motors_drives'], ['bearing', 'motor_winding']],
  ['gearbox', 'Gearbox', ['gear reducer', 'speed reducer', 'reduction gearbox', 'worm gearbox'], [stage('electrical_automation'), ind('general')], ['motors_drives'], ['gears', 'bearing', 'oil_seal']],
  ['electrical_panel', 'Electrical panel', ['control panel', 'MCC panel', 'PCC panel', 'starter panel', 'distribution board'], [stage('electrical_automation'), ind('general')], ['electrical_equipment'], ['contactor', 'circuit_breaker', 'overload_relay'], { regulated_work: 'electrical_installation', regulated_note: 'Electrical installation work may need a licensed electrical contractor or supervisor.' }],
  ['plc_system', 'PLC control system', ['PLC', 'programmable logic controller', 'PLC panel'], [stage('electrical_automation'), ind('general')], ['plc_hmi_scada', 'industrial_automation'], ['plc_cpu', 'plc_io_module']],
  ['vfd', 'Variable frequency drive (VFD)', ['VFD', 'AC drive', 'inverter drive', 'frequency converter', 'variable speed drive'], [stage('electrical_automation'), ind('general')], ['motors_drives'], []],
  // --- general industry
  ['lathe', 'Lathe machine', ['lathe', 'conventional lathe', 'centre lathe'], [ind('engineering')], ['machine_tools'], ['spindle', 'gears', 'bearing']],
  ['milling_machine', 'Milling machine', ['conventional milling machine'], [ind('engineering')], ['machine_tools'], ['spindle', 'gears']],
  ['drilling_machine', 'Drilling machine', ['radial drill', 'pillar drill', 'drill machine'], [ind('engineering')], ['machine_tools'], ['spindle']],
  ['grinding_machine', 'Grinding machine', ['surface grinder', 'cylindrical grinder', 'grinder'], [ind('engineering')], ['machine_tools'], ['spindle']],
  ['cnc_lathe', 'CNC lathe', ['CNC turning centre', 'turning center', 'CNC turning machine'], [ind('engineering')], ['cnc_machines'], ['spindle', 'ball_screw', 'servo_motor', 'encoder']],
  ['vmc', 'Vertical machining centre (VMC)', ['VMC', 'CNC milling machine', 'machining center', 'vertical machining center'], [ind('engineering')], ['cnc_machines'], ['spindle', 'ball_screw', 'servo_motor', 'encoder']],
  ['hmc', 'Horizontal machining centre (HMC)', ['HMC', 'horizontal machining center'], [ind('engineering')], ['cnc_machines'], ['spindle', 'ball_screw', 'servo_motor', 'encoder']],
  ['transformer', 'Transformer', ['distribution transformer', 'power transformer'], [ind('general')], ['electrical_equipment', 'industrial_utilities'], [], { regulated_work: 'electrical_installation', regulated_note: 'Work on transformers and HT installations may need licensed personnel and inspection.' }],
  ['dg_set', 'Diesel generator (DG set)', ['DG set', 'generator', 'genset', 'diesel generator'], [ind('general')], ['electrical_equipment', 'industrial_utilities'], ['air_filter'], { regulated_work: 'electrical_installation', regulated_note: 'Generator installation and connection may need licensed electrical personnel.' }],
  ['apfc_panel', 'APFC panel', ['capacitor panel', 'power factor correction panel', 'automatic power factor control panel'], [ind('general')], ['electrical_equipment'], ['contactor', 'circuit_breaker'], { regulated_work: 'electrical_installation', regulated_note: 'Electrical installation work may need a licensed electrical contractor or supervisor.' }],
  ['soft_starter', 'Soft starter', ['motor soft starter'], [ind('general')], ['motors_drives'], []],
  ['dc_drive', 'DC motor and drive', ['DC motor', 'DC drive'], [ind('general')], ['motors_drives'], ['motor_winding', 'bearing']],
  ['industrial_robot', 'Industrial robot', ['robot arm', 'robotic arm'], [ind('engineering')], ['industrial_automation'], ['servo_motor', 'encoder']],
  ['servo_system', 'Servo motor and drive', ['servo system', 'servo drive'], [ind('general')], ['industrial_automation', 'motors_drives'], ['servo_motor', 'encoder']],
  ['hmi', 'HMI touch panel', ['HMI', 'operator panel', 'touch screen panel'], [ind('general')], ['plc_hmi_scada'], []],
  ['scada_system', 'SCADA system', ['SCADA', 'supervisory control system'], [ind('general')], ['plc_hmi_scada'], []],
  ['centrifugal_pump', 'Centrifugal pump', ['water pump', 'monoblock pump', 'end suction pump'], [ind('general'), ind('water_treatment')], ['pumps_compressors'], ['impeller', 'mechanical_seal', 'bearing']],
  ['submersible_pump', 'Submersible pump', ['borewell pump', 'submersible motor pump'], [ind('general'), ind('water_treatment')], ['pumps_compressors'], ['impeller', 'motor_winding']],
  ['pd_pump', 'Positive displacement pump', ['screw pump', 'lobe pump', 'diaphragm pump'], [ind('general')], ['pumps_compressors'], ['mechanical_seal']],
  ['vacuum_pump', 'Vacuum pump', ['vacuum system'], [ind('general')], ['pumps_compressors'], []],
  ['hydraulic_power_pack', 'Hydraulic power pack', ['hydraulic unit', 'power pack', 'hydraulic system'], [ind('general')], ['hydraulic_pneumatic'], ['hydraulic_pump', 'solenoid_valve', 'oil_seal']],
  ['hydraulic_press', 'Hydraulic press', ['press machine', 'power press'], [ind('engineering')], ['hydraulic_pneumatic', 'machine_tools'], ['hydraulic_pump', 'solenoid_valve', 'oil_seal']],
  ['pneumatic_system', 'Pneumatic cylinders and valves', ['pneumatic system', 'pneumatic actuator', 'air cylinder'], [ind('general')], ['hydraulic_pneumatic'], ['solenoid_valve']],
  ['eot_crane', 'EOT crane', ['overhead crane', 'electric overhead travelling crane', 'gantry crane'], [ind('general')], ['material_handling'], ['gears', 'bearing'], { regulated_work: 'lifting_equipment', regulated_note: 'Cranes and hoists may need periodic statutory examination by a competent person.' }],
  ['chain_hoist', 'Electric chain hoist', ['hoist', 'chain pulley block', 'wire rope hoist'], [ind('general')], ['material_handling'], ['gears'], { regulated_work: 'lifting_equipment', regulated_note: 'Cranes and hoists may need periodic statutory examination by a competent person.' }],
  ['forklift', 'Forklift', ['fork lift truck', 'stacker'], [ind('general')], ['material_handling'], []],
  ['thermic_fluid_heater', 'Thermic fluid heater', ['thermal oil heater', 'TFH', 'hot oil heater'], [ind('general')], ['boilers_furnaces'], ['temperature_sensor']],
  ['industrial_furnace', 'Industrial furnace / oven', ['furnace', 'heat treatment furnace', 'industrial oven'], [ind('engineering')], ['boilers_furnaces'], ['heating_element', 'temperature_sensor']],
  ['cooling_tower', 'Cooling tower', ['CT'], [ind('general')], ['cooling_towers_chillers'], []],
  ['chiller', 'Chiller', ['water chiller', 'process chiller'], [ind('general')], ['cooling_towers_chillers'], []],
  ['industrial_mixer', 'Industrial mixer', ['mixer', 'ribbon blender', 'blender'], [ind('food_processing')], ['food_processing_equipment'], ['gears', 'bearing']],
  ['pulverizer', 'Pulverizer / grinding mill', ['pulverizer', 'hammer mill', 'flour mill machine', 'grinder'], [ind('food_processing')], ['food_processing_equipment'], ['sieve_screen', 'bearing']],
  ['tray_dryer', 'Tray dryer', ['food dryer', 'dehydrator'], [ind('food_processing')], ['food_processing_equipment'], ['heating_element', 'temperature_sensor']],
  ['ffs_machine', 'Form fill seal machine', ['FFS machine', 'pouch packing machine', 'VFFS'], [ind('packaging'), ind('food_processing')], ['packaging_machinery'], ['heating_element', 'load_cell']],
  ['carton_sealer', 'Carton sealing machine', ['carton taping machine', 'box sealer'], [ind('packaging')], ['packaging_machinery'], []],
  ['shrink_wrapper', 'Shrink wrapping machine', ['shrink tunnel', 'shrink wrapper'], [ind('packaging')], ['packaging_machinery'], ['heating_element']],
  ['labelling_machine', 'Labelling machine', ['labeller', 'labeling machine'], [ind('packaging')], ['packaging_machinery'], []],
  ['injection_moulding', 'Injection moulding machine', ['injection molding machine', 'IMM', 'moulding machine'], [ind('plastics_rubber')], ['plastics_rubber_machinery'], ['hydraulic_pump', 'heating_element', 'temperature_sensor']],
  ['extruder', 'Plastic extruder', ['extrusion line', 'extruder'], [ind('plastics_rubber')], ['plastics_rubber_machinery'], ['heating_element', 'gears']],
  ['blow_moulding', 'Blow moulding machine', ['blow molding machine'], [ind('plastics_rubber')], ['plastics_rubber_machinery'], ['heating_element']],
  ['rubber_mixing_mill', 'Rubber mixing mill', ['two roll mill', 'mixing mill'], [ind('plastics_rubber')], ['plastics_rubber_machinery'], ['gears', 'bearing']],
  ['ring_frame', 'Ring spinning frame', ['ring frame', 'spinning machine'], [ind('textile')], ['textile_machinery'], []],
  ['carding_machine', 'Carding machine', ['card', 'carding'], [ind('textile')], ['textile_machinery'], []],
  ['loom', 'Loom', ['power loom', 'weaving machine', 'rapier loom', 'airjet loom'], [ind('textile')], ['textile_machinery'], []],
  ['dyeing_machine', 'Textile dyeing machine', ['dyeing machine', 'jigger'], [ind('textile')], ['textile_machinery'], ['heating_element']],
  ['offset_press', 'Offset printing machine', ['offset press', 'offset machine'], [ind('printing')], ['printing_machinery'], []],
  ['flexo_press', 'Flexographic printing machine', ['flexo', 'flexo printing machine'], [ind('printing'), ind('packaging')], ['printing_machinery'], []],
  ['arc_welder', 'Arc welding machine', ['welding machine', 'stick welder', 'MMA welder'], [ind('engineering')], ['welding_fabrication'], []],
  ['mig_welder', 'MIG/MAG welding machine', ['MIG welder', 'CO2 welding machine'], [ind('engineering')], ['welding_fabrication'], []],
  ['tig_welder', 'TIG welding machine', ['TIG welder', 'argon welding machine'], [ind('engineering')], ['welding_fabrication'], []],
  ['plasma_cutter', 'Plasma cutting machine', ['plasma cutter', 'CNC plasma'], [ind('engineering')], ['welding_fabrication'], []],
  ['pressure_transmitter', 'Pressure transmitter', ['pressure sensor', 'pressure transducer'], [ind('general')], ['instrumentation'], []],
  ['temperature_controller', 'Temperature controller', ['PID controller', 'temperature indicator controller'], [ind('general')], ['instrumentation'], ['temperature_sensor']],
  ['flow_meter', 'Flow meter', ['flowmeter', 'magnetic flow meter'], [ind('general'), ind('water_treatment')], ['instrumentation'], []],
  ['level_sensor', 'Level transmitter / sensor', ['level sensor', 'level switch'], [ind('general')], ['instrumentation'], []],
  ['weighing_scale', 'Weighing scale', ['platform scale', 'weighing machine'], [ind('general'), stage('packing')], ['instrumentation'], ['load_cell']],
  ['utm', 'Universal testing machine', ['UTM', 'tensile testing machine'], [ind('engineering')], ['testing_equipment'], ['load_cell']],
  ['hardness_tester', 'Hardness tester', ['Rockwell tester', 'Brinell tester'], [ind('engineering')], ['testing_equipment'], []],
  ['ro_plant', 'Reverse osmosis (RO) plant', ['RO plant', 'RO system', 'water purifier plant'], [ind('water_treatment'), ind('general')], ['water_treatment_equipment'], []],
  ['water_softener', 'Water softener', ['softener plant'], [ind('water_treatment'), ind('general')], ['water_treatment_equipment'], []],
  ['etp', 'Effluent treatment plant (ETP)', ['ETP', 'wastewater treatment plant', 'STP'], [ind('water_treatment')], ['water_treatment_equipment'], []],
];
MACHINES.forEach(([slug, name, aliases, usedIn, categories, components, extra], i) =>
  add('machine_type', `machine.${slug}`, name, {
    aliases,
    sort_order: i + 1,
    links: links(['used_in', usedIn], ['in_category', categories.map(cat)], ['has_component', components.map(comp)]),
    ...(extra ?? {}),
  }),
);

add('machine_type', 'machine.unknown', "I don't know the machine name", {
  aliases: ['not sure', 'other machine', 'unknown machine'],
  description: 'Choose this if you do not know the machine name. Describe it and add photos; providers will ask questions.',
  is_generic: true,
  sort_order: 9999,
  links: links(['used_in', ind('general')]),
});
const m = (slug) => `machine.${slug}`;

// ----------------------------------------------------------------- reported problem types (not diagnoses)
const FAULT_NOTE = 'A problem the customer reports. It is not a diagnosis; the provider assesses the cause.';
const GENERIC_FAULTS = [
  ['machine_stopped', 'Machine stopped / will not start', ['breakdown', 'not starting', 'stopped']],
  ['unusual_noise', 'Unusual noise', ['noise', 'knocking', 'sound']],
  ['vibration', 'Excessive vibration', ['vibration', 'shaking']],
  ['overheating', 'Overheating', ['heating up', 'too hot']],
  ['low_output', 'Low output / capacity', ['low capacity', 'slow', 'low production']],
  ['electrical_fault', 'Electrical fault / tripping', ['tripping', 'short circuit', 'power problem']],
  ['automation_fault', 'Automation or control fault', ['PLC error', 'HMI error', 'control problem', 'alarm']],
  ['leakage', 'Oil, air or water leakage', ['leak', 'oil leak', 'air leak']],
  ['poor_quality', 'Poor output quality', ['quality problem', 'rejection']],
];
GENERIC_FAULTS.forEach(([slug, name, aliases], i) =>
  add('fault', `fault.${slug}`, name, { aliases, description: FAULT_NOTE, is_generic: true, sort_order: i + 1 }),
);
const RICE_FAULTS = [
  ['low_husking_efficiency', 'Low husking efficiency', ['paddy not shelling', 'poor husking'], [m('rubber_roll_husker')]],
  ['high_broken_rice', 'High broken rice percentage', ['too many brokens', 'rice breaking'], [m('rubber_roll_husker'), m('rice_whitener'), m('rice_polisher'), m('paddy_dryer')]],
  ['rubber_roll_wear', 'Rubber roll wearing out quickly', ['roll wear', 'roll damage'], [m('rubber_roll_husker'), comp('rubber_roll')]],
  ['paddy_in_brown_rice', 'Paddy mixed in brown rice', ['paddy carry-over', 'separation problem'], [m('paddy_separator')]],
  ['uneven_whitening', 'Uneven whitening', ['bran not removed', 'uneven milling'], [m('rice_whitener')]],
  ['sorter_rejecting_good_grain', 'Colour sorter rejecting good grain', ['good rice in reject', 'sorter not accurate'], [m('colour_sorter')]],
  ['stones_after_destoning', 'Stones remaining after destoning', ['stones in rice'], [m('destoner')]],
  ['elevator_choking', 'Bucket elevator choking / jamming', ['elevator jam', 'choke'], [m('bucket_elevator')]],
  ['uneven_drying', 'Uneven drying / moisture variation', ['moisture problem', 'over drying'], [m('paddy_dryer')]],
  ['low_steam_pressure', 'Low steam pressure', ['steam problem'], [m('boiler')]],
  ['vfd_fault_code', 'VFD tripping / showing fault code', ['drive fault', 'inverter trip'], [m('vfd')]],
  ['low_air_pressure', 'Low compressed air pressure', ['air pressure low'], [m('air_compressor')]],
];
RICE_FAULTS.forEach(([slug, name, aliases, targets], i) =>
  add('fault', `fault.${slug}`, name, { aliases, description: FAULT_NOTE, sort_order: 100 + i, links: links(['fault_of', targets]) }),
);

// ----------------------------------------------------------------- service skills
// [slug, name, aliases, disciplines, appliesTo (machine/category/component keys), extra]
const SKILLS = [
  ['breakdown_repair', 'Breakdown repair', ['repair', 'breakdown maintenance'], ['mechanical', 'electrical'], [], { is_generic: true }],
  ['preventive_maintenance', 'Preventive maintenance', ['PM', 'servicing', 'AMC'], ['mechanical', 'electrical'], [], { is_generic: true }],
  ['installation_commissioning', 'Installation and commissioning', ['installation', 'erection', 'commissioning'], ['mechanical', 'electrical'], [], { is_generic: true }],
  ['overhaul', 'Overhaul', ['reconditioning', 'rebuild'], ['mechanical'], [], { is_generic: true }],
  ['rice_mill_machinery_service', 'Rice mill machinery servicing', ['rice mill maintenance', 'rice mill mechanic'], ['mechanical'], [cat('grain_processing')]],
  ['rubber_roll_replacement', 'Rubber roll replacement and roll gap setting', ['roll change', 'husker setting'], ['mechanical'], [m('rubber_roll_husker'), comp('rubber_roll')]],
  ['whitener_service', 'Whitener stone and screen replacement', ['whitener service', 'stone change'], ['mechanical'], [m('rice_whitener'), comp('whitening_stone')]],
  ['colour_sorter_calibration', 'Colour sorter calibration and service', ['sorter calibration', 'sorter service'], ['automation', 'instrumentation'], [m('colour_sorter')]],
  ['dryer_service', 'Paddy dryer servicing', ['dryer maintenance'], ['mechanical', 'thermal'], [m('paddy_dryer')]],
  ['motor_rewinding', 'Motor rewinding', ['rewinding', 'winding work'], ['electrical'], [m('electric_motor'), comp('motor_winding')]],
  ['vfd_setup', 'VFD setup and troubleshooting', ['drive programming', 'inverter repair'], ['electrical', 'automation'], [m('vfd')]],
  ['plc_programming', 'PLC programming and troubleshooting', ['PLC programming', 'ladder logic'], ['automation'], [m('plc_system'), cat('plc_hmi_scada')]],
  ['hmi_scada_config', 'HMI and SCADA configuration', ['HMI programming', 'SCADA configuration'], ['automation'], [m('hmi'), m('scada_system')]],
  ['panel_wiring', 'Electrical panel wiring and maintenance', ['panel work', 'control wiring'], ['electrical'], [m('electrical_panel'), m('apfc_panel')], { regulated_work: 'electrical_installation', regulated_note: 'Electrical installation work may need a licensed electrical contractor or supervisor.' }],
  ['boiler_maintenance', 'Boiler maintenance and repair', ['boiler service'], ['thermal'], [m('boiler')], { regulated_work: 'boiler', regulated_note: 'Boiler repairs may need an approved boiler repairer.' }],
  ['compressor_servicing', 'Air compressor servicing', ['compressor repair'], ['mechanical'], [m('air_compressor')]],
  ['pump_repair', 'Pump repair', ['pump service'], ['mechanical'], [m('centrifugal_pump'), m('submersible_pump'), m('pd_pump')]],
  ['hydraulic_repair', 'Hydraulic system repair', ['hydraulics'], ['fluid_power'], [cat('hydraulic_pneumatic')]],
  ['pneumatic_repair', 'Pneumatic system repair', ['pneumatics'], ['fluid_power'], [m('pneumatic_system')]],
  ['cnc_maintenance', 'CNC machine maintenance', ['CNC repair', 'CNC service'], ['mechanical', 'automation'], [cat('cnc_machines')]],
  ['cnc_programming', 'CNC programming', ['G code', 'CNC setting'], ['automation'], [cat('cnc_machines')]],
  ['alignment_balancing', 'Shaft alignment and balancing', ['laser alignment', 'dynamic balancing'], ['mechanical'], [comp('shaft_coupling'), cat('motors_drives')]],
  ['bearing_replacement', 'Bearing replacement', ['bearing change'], ['mechanical'], [comp('bearing')]],
  ['gearbox_repair', 'Gearbox repair', ['gearbox overhaul'], ['mechanical'], [m('gearbox')]],
  ['conveyor_maintenance', 'Conveyor and elevator maintenance', ['belt jointing', 'conveyor repair'], ['mechanical'], [cat('material_handling'), m('bucket_elevator')]],
  ['crane_maintenance', 'Crane and hoist maintenance', ['crane repair'], ['mechanical', 'electrical'], [m('eot_crane'), m('chain_hoist')], { regulated_work: 'lifting_equipment', regulated_note: 'Statutory examination of lifting equipment must be done by a competent person.' }],
  ['welding_fabrication_work', 'Welding and fabrication work', ['welding', 'fabrication'], ['fabrication'], [cat('welding_fabrication')]],
  ['instrument_calibration', 'Instrument calibration', ['calibration'], ['instrumentation'], [cat('instrumentation'), cat('testing_equipment')]],
  ['chiller_service', 'Chiller and cooling tower service', ['chiller repair'], ['thermal'], [cat('cooling_towers_chillers')]],
  ['water_treatment_service', 'Water treatment plant service', ['RO service', 'ETP maintenance'], ['mechanical'], [cat('water_treatment_equipment')]],
  ['plastics_machine_service', 'Plastics machinery service', ['moulding machine repair'], ['mechanical', 'fluid_power'], [cat('plastics_rubber_machinery')]],
  ['textile_machine_service', 'Textile machinery service', ['textile mechanic'], ['mechanical'], [cat('textile_machinery')]],
  ['printing_machine_service', 'Printing machinery service', ['press mechanic'], ['mechanical'], [cat('printing_machinery')]],
  ['packaging_machine_service', 'Packaging machinery service', ['packing machine repair'], ['mechanical', 'automation'], [cat('packaging_machinery')]],
  ['dg_set_service', 'DG set servicing', ['generator service'], ['electrical', 'mechanical'], [m('dg_set')]],
];
SKILLS.forEach(([slug, name, aliases, disciplines, appliesTo, extra], i) =>
  add('service_skill', `skill.${slug}`, name, {
    aliases,
    sort_order: i + 1,
    links: links(['in_discipline', disciplines.map((d) => `discipline.${d}`)], ['skill_for', appliesTo]),
    ...(extra ?? {}),
  }),
);

export default rows;
