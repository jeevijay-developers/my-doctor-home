// Static dataset of Indian States/UTs with major cities & towns.
// Coverage: 28 states + 8 UTs, ~15-25 cities each (~700 cities total).
// Curated for form-selector use; not exhaustive.

export const INDIA_STATES_CITIES: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam","Vijayawada","Guntur","Nellore","Kurnool","Rajahmundry","Tirupati","Kadapa","Kakinada","Anantapur","Eluru","Ongole","Chittoor","Machilipatnam","Srikakulam","Vizianagaram","Proddatur","Nandyal","Adoni","Tenali"],
  "Arunachal Pradesh": ["Itanagar","Naharlagun","Pasighat","Tawang","Ziro","Bomdila","Tezu","Along","Roing","Khonsa","Changlang","Namsai"],
  "Assam": ["Guwahati","Dibrugarh","Silchar","Jorhat","Nagaon","Tinsukia","Tezpur","Bongaigaon","Karimganj","Sivasagar","Diphu","Goalpara","Barpeta","Dhubri","North Lakhimpur"],
  "Bihar": ["Patna","Gaya","Bhagalpur","Muzaffarpur","Darbhanga","Purnia","Ara","Begusarai","Katihar","Munger","Chhapra","Danapur","Bettiah","Saharsa","Hajipur","Sasaram","Dehri","Siwan","Motihari","Nawada"],
  "Chhattisgarh": ["Raipur","Bhilai","Bilaspur","Korba","Durg","Rajnandgaon","Jagdalpur","Raigarh","Ambikapur","Dhamtari","Mahasamund","Kanker","Kawardha","Chirmiri"],
  "Goa": ["Panaji","Margao","Vasco da Gama","Mapusa","Ponda","Bicholim","Curchorem","Cuncolim","Canacona","Valpoi","Sanguem","Quepem"],
  "Gujarat": ["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Junagadh","Gandhinagar","Anand","Nadiad","Navsari","Bharuch","Mehsana","Morbi","Surendranagar","Vapi","Valsad","Porbandar","Gandhidham","Palanpur"],
  "Haryana": ["Gurugram","Faridabad","Panipat","Ambala","Yamunanagar","Rohtak","Hisar","Karnal","Sonipat","Panchkula","Bhiwani","Sirsa","Bahadurgarh","Jind","Kaithal","Rewari","Palwal","Kurukshetra","Fatehabad","Narnaul"],
  "Himachal Pradesh": ["Shimla","Dharamshala","Solan","Mandi","Kullu","Manali","Palampur","Bilaspur","Chamba","Hamirpur","Una","Nahan","Kangra","Sundernagar"],
  "Jharkhand": ["Ranchi","Jamshedpur","Dhanbad","Bokaro","Deoghar","Hazaribagh","Giridih","Ramgarh","Phusro","Medininagar","Chaibasa","Dumka","Jhumri Telaiya","Sahibganj"],
  "Karnataka": ["Bengaluru","Mysuru","Hubballi","Mangaluru","Belagavi","Kalaburagi","Davanagere","Ballari","Vijayapura","Shivamogga","Tumakuru","Raichur","Bidar","Hospet","Hassan","Gadag","Udupi","Chikkamagaluru","Kolar","Chitradurga"],
  "Kerala": ["Thiruvananthapuram","Kochi","Kozhikode","Thrissur","Kollam","Alappuzha","Palakkad","Kannur","Kottayam","Malappuram","Kasaragod","Pathanamthitta","Idukki","Ernakulam","Wayanad","Guruvayur","Changanassery","Muvattupuzha"],
  "Madhya Pradesh": ["Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Dewas","Satna","Ratlam","Rewa","Katni","Singrauli","Burhanpur","Khandwa","Morena","Bhind","Chhindwara","Vidisha","Damoh","Mandsaur"],
  "Maharashtra": ["Mumbai","Pune","Nagpur","Thane","Nashik","Aurangabad","Solapur","Amravati","Kolhapur","Navi Mumbai","Sangli","Jalgaon","Akola","Latur","Dhule","Ahmednagar","Chandrapur","Parbhani","Ichalkaranji","Nanded"],
  "Manipur": ["Imphal","Thoubal","Bishnupur","Churachandpur","Kakching","Ukhrul","Senapati","Tamenglong","Jiribam","Moirang"],
  "Meghalaya": ["Shillong","Tura","Jowai","Nongstoin","Baghmara","Williamnagar","Nongpoh","Resubelpara","Mairang"],
  "Mizoram": ["Aizawl","Lunglei","Champhai","Serchhip","Kolasib","Saiha","Lawngtlai","Mamit"],
  "Nagaland": ["Kohima","Dimapur","Mokokchung","Tuensang","Wokha","Zunheboto","Phek","Mon","Kiphire","Longleng"],
  "Odisha": ["Bhubaneswar","Cuttack","Rourkela","Berhampur","Sambalpur","Puri","Balasore","Bhadrak","Baripada","Jharsuguda","Jeypore","Angul","Dhenkanal","Kendrapara","Rayagada"],
  "Punjab": ["Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Mohali","Hoshiarpur","Batala","Pathankot","Moga","Abohar","Malerkotla","Khanna","Phagwara","Muktsar","Barnala","Firozpur","Kapurthala","Sangrur","Rajpura"],
  "Rajasthan": ["Jaipur","Jodhpur","Udaipur","Kota","Ajmer","Bikaner","Alwar","Bharatpur","Sikar","Pali","Sri Ganganagar","Kishangarh","Beawar","Hanumangarh","Dhaulpur","Tonk","Barmer","Nagaur","Bhilwara","Chittorgarh","Churu","Jhunjhunu","Banswara"],
  "Sikkim": ["Gangtok","Namchi","Gyalshing","Mangan","Rangpo","Singtam","Jorethang","Ravangla"],
  "Tamil Nadu": ["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Tiruppur","Erode","Vellore","Thoothukudi","Dindigul","Thanjavur","Ranipet","Nagercoil","Kanchipuram","Karur","Cuddalore","Kumbakonam","Tiruvannamalai","Hosur","Nagapattinam","Ooty"],
  "Telangana": ["Hyderabad","Warangal","Nizamabad","Karimnagar","Khammam","Ramagundam","Mahbubnagar","Nalgonda","Adilabad","Suryapet","Miryalaguda","Siddipet","Jagtial","Mancherial","Kothagudem"],
  "Tripura": ["Agartala","Udaipur","Dharmanagar","Kailashahar","Belonia","Ambassa","Khowai","Teliamura","Sabroom"],
  "Uttar Pradesh": ["Lucknow","Kanpur","Ghaziabad","Agra","Meerut","Varanasi","Prayagraj","Bareilly","Aligarh","Moradabad","Saharanpur","Gorakhpur","Noida","Firozabad","Jhansi","Muzaffarnagar","Mathura","Ayodhya","Rampur","Shahjahanpur","Etawah","Mirzapur","Bulandshahr","Sambhal","Amroha","Hardoi","Fatehpur","Raebareli","Sitapur","Unnao"],
  "Uttarakhand": ["Dehradun","Haridwar","Roorkee","Haldwani","Rudrapur","Kashipur","Rishikesh","Nainital","Mussoorie","Pithoragarh","Ramnagar","Almora","Pauri","Kotdwar"],
  "West Bengal": ["Kolkata","Howrah","Durgapur","Asansol","Siliguri","Bardhaman","Malda","Kharagpur","Haldia","Krishnanagar","Baharampur","Raiganj","Jalpaiguri","Bankura","Purulia","Balurghat","Medinipur","Darjeeling","Cooch Behar","Barasat"],
  "Andaman and Nicobar Islands": ["Port Blair","Bamboo Flat","Garacharma","Diglipur","Rangat","Mayabunder"],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Daman","Diu","Silvassa","Amli"],
  "Delhi": ["New Delhi","North Delhi","South Delhi","East Delhi","West Delhi","Central Delhi","Dwarka","Rohini","Pitampura","Saket","Karol Bagh","Janakpuri","Vasant Kunj","Najafgarh","Narela"],
  "Jammu and Kashmir": ["Srinagar","Jammu","Anantnag","Baramulla","Udhampur","Kathua","Sopore","Kupwara","Pulwama","Rajouri","Poonch","Doda"],
  "Ladakh": ["Leh","Kargil","Nubra","Zanskar","Drass","Nyoma"],
  "Lakshadweep": ["Kavaratti","Agatti","Minicoy","Amini","Andrott","Kalpeni","Kadmat"],
  "Puducherry": ["Puducherry","Karaikal","Yanam","Mahe","Ozhukarai","Villianur"],
};

export const INDIA_STATES = Object.keys(INDIA_STATES_CITIES).sort();
export const getCitiesForState = (state: string): string[] =>
  INDIA_STATES_CITIES[state] ? [...INDIA_STATES_CITIES[state]].sort() : [];
