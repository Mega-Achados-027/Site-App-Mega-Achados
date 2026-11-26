import type {Airport} from '../types.ts';

/**
 * Lista completa dos aeroportos comerciais do Brasil (todos os 26 estados + DF)
 * com sinalização explícita (`hasInternationalFlights`) para os aeroportos brasileiros
 * que operam rotas internacionais regulares/sazonais.
 */
export const BRAZILIAN_AIRPORTS: Airport[] = [
  // --- SÃO PAULO (SP) ---
  {iata: 'GRU', name: 'Aeroporto Internacional de Guarulhos', city: 'São Paulo (Guarulhos)', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: true, lat: -23.4356, lon: -46.4731},
  {iata: 'CGH', name: 'Aeroporto de Congonhas', city: 'São Paulo', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -23.6261, lon: -46.6564},
  {iata: 'VCP', name: 'Aeroporto Internacional de Viracopos', city: 'Campinas', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: true, lat: -23.0074, lon: -47.1345},
  {iata: 'RAO', name: 'Aeroporto Leite Lopes', city: 'Ribeirão Preto', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -21.1364, lon: -47.7767},
  {iata: 'SJP', name: 'Aeroporto Prof. Eribelto Manoel Reino', city: 'São José do Rio Preto', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -20.8166, lon: -49.4065},
  {iata: 'PPB', name: 'Aeroporto Estadual Adhemar de Barros', city: 'Presidente Prudente', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -22.1751, lon: -51.4246},
  {iata: 'JTC', name: 'Aeroporto Estadual Moussa Nakhl Tobias', city: 'Bauru / Arealva', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -22.1578, lon: -49.0683},
  {iata: 'SJK', name: 'Aeroporto Prof. Urbano Ernesto Stumpf', city: 'São José dos Campos', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -23.2289, lon: -45.8711},
  {iata: 'ARU', name: 'Aeroporto Estadual Dario Guarita', city: 'Araçatuba', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -21.1413, lon: -50.4247},
  {iata: 'MII', name: 'Aeroporto Estadual Frank Miloye Milenkovich', city: 'Marília', stateOrCountry: 'SP', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -22.1969, lon: -49.9264},

  // --- RIO DE JANEIRO (RJ) ---
  {iata: 'GIG', name: 'Aeroporto Internacional Tom Jobim (Galeão)', city: 'Rio de Janeiro', stateOrCountry: 'RJ', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: true, lat: -22.8099, lon: -43.2505},
  {iata: 'SDU', name: 'Aeroporto Santos Dumont', city: 'Rio de Janeiro', stateOrCountry: 'RJ', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -22.9105, lon: -43.1631},
  {iata: 'CFB', name: 'Aeroporto Internacional de Cabo Frio', city: 'Cabo Frio', stateOrCountry: 'RJ', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -22.9217, lon: -42.0743},
  {iata: 'MEA', name: 'Aeroporto Benedito Lacerda', city: 'Macaé', stateOrCountry: 'RJ', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -22.3430, lon: -41.7660},
  {iata: 'CAW', name: 'Aeroporto Bartolomeu Lisandro', city: 'Campos dos Goytacazes', stateOrCountry: 'RJ', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -21.6983, lon: -41.3017},

  // --- ESPÍRITO SANTO (ES - DDD 027) ---
  {iata: 'VIX', name: 'Aeroporto Eurico de Aguiar Salles', city: 'Vitória', stateOrCountry: 'ES', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -20.2581, lon: -40.2864},
  {iata: 'LIN', name: 'Aeroporto Regional de Linhares', city: 'Linhares', stateOrCountry: 'ES', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -19.3553, lon: -40.0706},
  {iata: 'CDI', name: 'Aeroporto Raimundo de Andrade', city: 'Cachoeiro de Itapemirim', stateOrCountry: 'ES', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -20.8344, lon: -41.1856},

  // --- MINAS GERAIS (MG) ---
  {iata: 'CNF', name: 'Aeroporto Internacional de Confins (BH)', city: 'Belo Horizonte (Confins)', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: true, lat: -19.6244, lon: -43.9719},
  {iata: 'PLU', name: 'Aeroporto da Pampulha', city: 'Belo Horizonte', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -19.8512, lon: -43.9506},
  {iata: 'UDI', name: 'Aeroporto Ten. Cel. Aviador César Bombonato', city: 'Uberlândia', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -18.8828, lon: -48.2256},
  {iata: 'UBA', name: 'Aeroporto Mário de Almeida Franco', city: 'Uberaba', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -19.7650, lon: -47.9647},
  {iata: 'MOC', name: 'Aeroporto Mário Ribeiro', city: 'Montes Claros', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -16.7069, lon: -43.8189},
  {iata: 'IZA', name: 'Aeroporto Regional da Zona da Mata', city: 'Juiz de Fora (Goianá)', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -21.5131, lon: -43.1731},
  {iata: 'IPN', name: 'Aeroporto Regional do Vale do Aço', city: 'Ipatinga / Santana do Paraíso', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -19.4707, lon: -42.4876},
  {iata: 'GVR', name: 'Aeroporto Coronel Altino Machado', city: 'Governador Valadares', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -18.8952, lon: -41.9822},
  {iata: 'VAG', name: 'Aeroporto Major Brigadeiro Trompowsky', city: 'Varginha', stateOrCountry: 'MG', region: 'Sudeste', isBrazilian: true, hasInternationalFlights: false, lat: -21.5901, lon: -45.4733},

  // --- DISTRITO FEDERAL & CENTRO-OESTE (DF, GO, MT, MS) ---
  {iata: 'BSB', name: 'Aeroporto Internacional Juscelino Kubitschek', city: 'Brasília', stateOrCountry: 'DF', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: true, lat: -15.8711, lon: -47.9186},
  {iata: 'GYN', name: 'Aeroporto Santa Genoveva', city: 'Goiânia', stateOrCountry: 'GO', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -16.6320, lon: -49.2207},
  {iata: 'CLV', name: 'Aeroporto Nelson Ribeiro Guimarães', city: 'Caldas Novas', stateOrCountry: 'GO', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -17.7253, lon: -48.6075},
  {iata: 'RVD', name: 'Aeroporto General Leite de Castro', city: 'Rio Verde', stateOrCountry: 'GO', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -17.8347, lon: -50.9561},
  {iata: 'CGB', name: 'Aeroporto Marechal Rondon', city: 'Cuiabá (Várzea Grande)', stateOrCountry: 'MT', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -15.6529, lon: -56.1167},
  {iata: 'OPS', name: 'Aeroporto Presidente João Figueiredo', city: 'Sinop', stateOrCountry: 'MT', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -11.8850, lon: -55.5861},
  {iata: 'ROO', name: 'Aeroporto Maestro Marinho Franco', city: 'Rondonópolis', stateOrCountry: 'MT', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -16.5860, lon: -54.7248},
  {iata: 'SMT', name: 'Aeroporto Regional de Sorriso', city: 'Sorriso', stateOrCountry: 'MT', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -12.4783, lon: -55.6736},
  {iata: 'AFL', name: 'Aeroporto Piloto Osvaldo Marques Dias', city: 'Alta Floresta', stateOrCountry: 'MT', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -9.8661, lon: -56.1062},
  {iata: 'CGR', name: 'Aeroporto de Campo Grande', stateOrCountry: 'MS', city: 'Campo Grande', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -20.4687, lon: -54.6725},
  {iata: 'DOU', name: 'Aeroporto Francisco de Matos Pereira', city: 'Dourados', stateOrCountry: 'MS', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -22.2006, lon: -54.9256},
  {iata: 'BYO', name: 'Aeroporto Regional de Bonito', city: 'Bonito', stateOrCountry: 'MS', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -21.2472, lon: -56.4525},
  {iata: 'CMG', name: 'Aeroporto de Corumbá', city: 'Corumbá', stateOrCountry: 'MS', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -19.0119, lon: -57.6714},
  {iata: 'TJL', name: 'Aeroporto Regional Plínio Alarcon', city: 'Três Lagoas', stateOrCountry: 'MS', region: 'Centro-Oeste', isBrazilian: true, hasInternationalFlights: false, lat: -20.7511, lon: -51.6783},

  // --- SUL (PR, SC, RS) ---
  {iata: 'CWB', name: 'Aeroporto Internacional Afonso Pena', city: 'Curitiba (São José dos Pinhais)', stateOrCountry: 'PR', region: 'Sul', isBrazilian: true, hasInternationalFlights: true, lat: -25.5285, lon: -49.1758},
  {iata: 'IGU', name: 'Aeroporto Internacional das Cataratas', city: 'Foz do Iguaçu', stateOrCountry: 'PR', region: 'Sul', isBrazilian: true, hasInternationalFlights: true, lat: -25.6003, lon: -54.4850},
  {iata: 'LDB', name: 'Aeroporto Governador José Richa', city: 'Londrina', stateOrCountry: 'PR', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -23.3336, lon: -51.1301},
  {iata: 'MGF', name: 'Aeroporto Regional Silvio Name Júnior', city: 'Maringá', stateOrCountry: 'PR', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -23.4764, lon: -52.0164},
  {iata: 'CAC', name: 'Aeroporto Regional do Oeste', city: 'Cascavel', stateOrCountry: 'PR', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -25.0003, lon: -53.5008},
  {iata: 'PGZ', name: 'Aeroporto Sant’Ana', city: 'Ponta Grossa', stateOrCountry: 'PR', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -25.1844, lon: -50.1439},
  {iata: 'FLN', name: 'Aeroporto Internacional Hercílio Luz', city: 'Florianópolis', stateOrCountry: 'SC', region: 'Sul', isBrazilian: true, hasInternationalFlights: true, lat: -27.6703, lon: -48.5525},
  {iata: 'NVT', name: 'Aeroporto Internacional Ministro Victor Konder', city: 'Navegantes (Baln. Camboriú)', stateOrCountry: 'SC', region: 'Sul', isBrazilian: true, hasInternationalFlights: true, lat: -26.8799, lon: -48.6514},
  {iata: 'JOI', name: 'Aeroporto Lauro Carneiro de Loyola', city: 'Joinville', stateOrCountry: 'SC', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -26.2244, lon: -48.7974},
  {iata: 'XAP', name: 'Aeroporto Serafim Enoss Bertaso', city: 'Chapecó', stateOrCountry: 'SC', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -27.1342, lon: -52.6566},
  {iata: 'JJG', name: 'Aeroporto Regional Sul Humberto Ghizzo Bortoluzzi', city: 'Jaguaruna', stateOrCountry: 'SC', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -28.6753, lon: -49.0603},
  {iata: 'POA', name: 'Aeroporto Internacional Salgado Filho', city: 'Porto Alegre', stateOrCountry: 'RS', region: 'Sul', isBrazilian: true, hasInternationalFlights: true, lat: -29.9944, lon: -51.1714},
  {iata: 'CXJ', name: 'Aeroporto Regional Hugo Cantergiani', city: 'Caxias do Sul', stateOrCountry: 'RS', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -29.1971, lon: -51.1875},
  {iata: 'PFB', name: 'Aeroporto Lauro Kurtz', city: 'Passo Fundo', stateOrCountry: 'RS', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -28.2440, lon: -52.3266},
  {iata: 'PET', name: 'Aeroporto João Simões Lopes Neto', city: 'Pelotas', stateOrCountry: 'RS', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -31.7184, lon: -52.3277},
  {iata: 'RIA', name: 'Aeroporto de Santa Maria', city: 'Santa Maria', stateOrCountry: 'RS', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -29.7114, lon: -53.6882},
  {iata: 'GEL', name: 'Aeroporto Sepé Tiaraju', city: 'Santo Ângelo', stateOrCountry: 'RS', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -28.2817, lon: -54.1691},
  {iata: 'URG', name: 'Aeroporto Rubem Berta', city: 'Uruguaiana', stateOrCountry: 'RS', region: 'Sul', isBrazilian: true, hasInternationalFlights: false, lat: -29.7822, lon: -57.0382},

  // --- NORDESTE (BA, PE, CE, RN, PB, AL, SE, MA, PI) ---
  {iata: 'SSA', name: 'Aeroporto Internacional Dep. Luís Eduardo Magalhães', city: 'Salvador', stateOrCountry: 'BA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: true, lat: -12.9086, lon: -38.3225},
  {iata: 'BPS', name: 'Aeroporto de Porto Seguro', city: 'Porto Seguro', stateOrCountry: 'BA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: true, lat: -16.4386, lon: -39.0809},
  {iata: 'IOS', name: 'Aeroporto Jorge Amado', city: 'Ilhéus', stateOrCountry: 'BA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -14.8160, lon: -39.0332},
  {iata: 'VDC', name: 'Aeroporto Glauber Rocha', city: 'Vitória da Conquista', stateOrCountry: 'BA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -14.9078, lon: -40.9169},
  {iata: 'LEC', name: 'Aeroporto Horácio de Mattos (Chapada Diamantina)', city: 'Lençóis', stateOrCountry: 'BA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -12.4823, lon: -41.2770},
  {iata: 'TXF', name: 'Aeroporto 9 de Maio', city: 'Teixeira de Freitas', stateOrCountry: 'BA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -17.5245, lon: -39.6684},
  {iata: 'BRA', name: 'Aeroporto Dom Ricardo Weberberger', city: 'Barreiras', stateOrCountry: 'BA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -12.0789, lon: -45.0090},
  {iata: 'REC', name: 'Aeroporto Internacional dos Guararapes', city: 'Recife', stateOrCountry: 'PE', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: true, lat: -8.1265, lon: -34.9236},
  {iata: 'PNZ', name: 'Aeroporto Senador Nilo Coelho', city: 'Petrolina', stateOrCountry: 'PE', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -9.3624, lon: -40.5691},
  {iata: 'FEN', name: 'Aeroporto Governador Carlos Wilson', city: 'Fernando de Noronha', stateOrCountry: 'PE', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -3.8549, lon: -32.4233},
  {iata: 'FOR', name: 'Aeroporto Internacional Pinto Martins', city: 'Fortaleza', stateOrCountry: 'CE', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: true, lat: -3.7763, lon: -38.5326},
  {iata: 'JDO', name: 'Aeroporto Orlando Bezerra de Menezes', city: 'Juazeiro do Norte', stateOrCountry: 'CE', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -7.2190, lon: -39.2701},
  {iata: 'JJD', name: 'Aeroporto Regional Comandante Ariston Pessoa', city: 'Jericoacoara (Cruz)', stateOrCountry: 'CE', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -2.9064, lon: -40.3581},
  {iata: 'NAT', name: 'Aeroporto Internacional Governador Aluízio Alves', city: 'Natal (São Gonçalo)', stateOrCountry: 'RN', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: true, lat: -5.7681, lon: -35.3761},
  {iata: 'MVF', name: 'Aeroporto Dix-Sept Rosado', city: 'Mossoró', stateOrCountry: 'RN', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -5.2019, lon: -37.3644},
  {iata: 'JPA', name: 'Aeroporto Internacional Presidente Castro Pinto', city: 'João Pessoa', stateOrCountry: 'PB', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -7.1458, lon: -34.9486},
  {iata: 'CPV', name: 'Aeroporto Presidente João Suassuna', city: 'Campina Grande', stateOrCountry: 'PB', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -7.2699, lon: -35.8964},
  {iata: 'MCZ', name: 'Aeroporto Internacional Zumbi dos Palmares', city: 'Maceió', stateOrCountry: 'AL', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: true, lat: -9.5108, lon: -35.7917},
  {iata: 'AJU', name: 'Aeroporto Santa Maria', city: 'Aracaju', stateOrCountry: 'SE', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -10.9840, lon: -37.0703},
  {iata: 'SLZ', name: 'Aeroporto Marechal Cunha Machado', city: 'São Luís', stateOrCountry: 'MA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -2.5854, lon: -44.2341},
  {iata: 'IMP', name: 'Aeroporto Prefeito Renato Moreira', city: 'Imperatriz', stateOrCountry: 'MA', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -5.5313, lon: -47.4601},
  {iata: 'THE', name: 'Aeroporto Senador Petrônio Portella', city: 'Teresina', stateOrCountry: 'PI', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -5.0599, lon: -42.8235},
  {iata: 'PHB', name: 'Aeroporto Internacional Prefeito Dr. João Silva Filho', city: 'Parnaíba', stateOrCountry: 'PI', region: 'Nordeste', isBrazilian: true, hasInternationalFlights: false, lat: -2.8938, lon: -41.7320},

  // --- NORTE (AM, PA, RO, AC, RR, AP, TO) ---
  {iata: 'MAO', name: 'Aeroporto Internacional Eduardo Gomes', city: 'Manaus', stateOrCountry: 'AM', region: 'Norte', isBrazilian: true, hasInternationalFlights: true, lat: -3.0386, lon: -60.0497},
  {iata: 'TBT', name: 'Aeroporto de Tabatinga', city: 'Tabatinga', stateOrCountry: 'AM', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -4.2557, lon: -69.9358},
  {iata: 'TFF', name: 'Aeroporto Regional de Tefé', city: 'Tefé', stateOrCountry: 'AM', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -3.3829, lon: -64.7241},
  {iata: 'PIN', name: 'Aeroporto Júlio Belém', city: 'Parintins', stateOrCountry: 'AM', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -2.6733, lon: -56.7772},
  {iata: 'BEL', name: 'Aeroporto Internacional de Val-de-Cans', city: 'Belém', stateOrCountry: 'PA', region: 'Norte', isBrazilian: true, hasInternationalFlights: true, lat: -1.3793, lon: -48.4763},
  {iata: 'STM', name: 'Aeroporto Maestro Wilson Fonseca', city: 'Santarém', stateOrCountry: 'PA', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -2.4247, lon: -54.7858},
  {iata: 'MAB', name: 'Aeroporto João Correa da Rocha', city: 'Marabá', stateOrCountry: 'PA', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -5.3686, lon: -49.1380},
  {iata: 'CKS', name: 'Aeroporto de Carajás', city: 'Parauapebas (Carajás)', stateOrCountry: 'PA', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -6.1178, lon: -50.0035},
  {iata: 'ATM', name: 'Aeroporto de Altamira', city: 'Altamira', stateOrCountry: 'PA', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -3.2539, lon: -52.2540},
  {iata: 'ITB', name: 'Aeroporto de Itaituba', city: 'Itaituba', stateOrCountry: 'PA', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -4.2423, lon: -56.0007},
  {iata: 'PVH', name: 'Aeroporto Governador Jorge Teixeira', city: 'Porto Velho', stateOrCountry: 'RO', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -8.7093, lon: -63.9023},
  {iata: 'JPR', name: 'Aeroporto José Coleto', city: 'Ji-Paraná', stateOrCountry: 'RO', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -10.8708, lon: -61.8465},
  {iata: 'OAL', name: 'Aeroporto Capital do Café', city: 'Cacoal', stateOrCountry: 'RO', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -11.4956, lon: -61.3853},
  {iata: 'RBR', name: 'Aeroporto Plácido de Castro', city: 'Rio Branco', stateOrCountry: 'AC', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -9.8689, lon: -67.8981},
  {iata: 'CZS', name: 'Aeroporto de Cruzeiro do Sul', city: 'Cruzeiro do Sul', stateOrCountry: 'AC', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -7.5999, lon: -72.7695},
  {iata: 'BVB', name: 'Aeroporto Atlas Brasil Cantanhede', city: 'Boa Vista', stateOrCountry: 'RR', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: 2.8463, lon: -60.6901},
  {iata: 'MCP', name: 'Aeroporto Alberto Alcolumbre', city: 'Macapá', stateOrCountry: 'AP', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: 0.0507, lon: -51.0722},
  {iata: 'PMW', name: 'Aeroporto Brigadeiro Lysias Rodrigues', city: 'Palmas', stateOrCountry: 'TO', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -10.2915, lon: -48.3570},
  {iata: 'AUX', name: 'Aeroporto de Araguaína', city: 'Araguaína', stateOrCountry: 'TO', region: 'Norte', isBrazilian: true, hasInternationalFlights: false, lat: -7.2279, lon: -48.2405},
];

export const BRAZILIAN_INTERNATIONAL_AIRPORTS: Airport[] = BRAZILIAN_AIRPORTS.filter(
  (a) => a.hasInternationalFlights,
);

export const INTERNATIONAL_DESTINATIONS: Airport[] = [
  // --- América do Sul ---
  {iata: 'EZE', name: 'Aeroporto Internacional Ministro Pistarini (Ezeiza)', city: 'Buenos Aires', stateOrCountry: 'Argentina', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -34.8222, lon: -58.5358},
  {iata: 'AEP', name: 'Aeroparque Jorge Newbery', city: 'Buenos Aires', stateOrCountry: 'Argentina', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -34.5592, lon: -58.4156},
  {iata: 'BRC', name: 'Aeroporto Internacional Teniente Luis Candelaria', city: 'Bariloche', stateOrCountry: 'Argentina', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -41.1512, lon: -71.1575},
  {iata: 'MDZ', name: 'Aeroporto Internacional El Plumerillo', city: 'Mendoza', stateOrCountry: 'Argentina', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -32.8317, lon: -68.7929},
  {iata: 'SCL', name: 'Aeroporto Internacional Arturo Merino Benítez', city: 'Santiago', stateOrCountry: 'Chile', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -33.3930, lon: -70.7858},
  {iata: 'MVD', name: 'Aeroporto Internacional de Carrasco', city: 'Montevidéu', stateOrCountry: 'Uruguai', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -34.8384, lon: -56.0308},
  {iata: 'PDP', name: 'Aeroporto Internacional Laguna del Sauce', city: 'Punta del Este', stateOrCountry: 'Uruguai', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -34.8551, lon: -55.0943},
  {iata: 'ASU', name: 'Aeroporto Internacional Silvio Pettirossi', city: 'Assunção', stateOrCountry: 'Paraguai', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -25.2400, lon: -57.5192},
  {iata: 'LIM', name: 'Aeroporto Internacional Jorge Chávez', city: 'Lima', stateOrCountry: 'Peru', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -12.0219, lon: -77.1143},
  {iata: 'BOG', name: 'Aeroporto Internacional El Dorado', city: 'Bogotá', stateOrCountry: 'Colômbia', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: 4.7016, lon: -74.1469},
  {iata: 'VVI', name: 'Aeroporto Internacional Viru Viru', city: 'Santa Cruz de la Sierra', stateOrCountry: 'Bolívia', region: 'América do Sul', isBrazilian: false, hasInternationalFlights: true, lat: -17.6448, lon: -63.1354},

  // --- América do Norte & Caribe ---
  {iata: 'MIA', name: 'Miami International Airport', city: 'Miami', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 25.7959, lon: -80.2870},
  {iata: 'MCO', name: 'Orlando International Airport', city: 'Orlando', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 28.4312, lon: -81.3081},
  {iata: 'FLL', name: 'Fort Lauderdale-Hollywood International', city: 'Fort Lauderdale', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 26.0742, lon: -80.1506},
  {iata: 'JFK', name: 'John F. Kennedy International Airport', city: 'Nova York', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 40.6413, lon: -73.7781},
  {iata: 'EWR', name: 'Newark Liberty International Airport', city: 'Nova York / Newark', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 40.6895, lon: -74.1745},
  {iata: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 33.6407, lon: -84.4277},
  {iata: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 29.9902, lon: -95.3368},
  {iata: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', stateOrCountry: 'EUA', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 33.9416, lon: -118.4085},
  {iata: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', stateOrCountry: 'Canadá', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 43.6777, lon: -79.6248},
  {iata: 'MEX', name: 'Aeroporto Internacional Benito Juárez', city: 'Cidade do México', stateOrCountry: 'México', region: 'América do Norte', isBrazilian: false, hasInternationalFlights: true, lat: 19.4363, lon: -99.0721},
  {iata: 'CUN', name: 'Aeroporto Internacional de Cancún', city: 'Cancún', stateOrCountry: 'México', region: 'Caribe & América Central', isBrazilian: false, hasInternationalFlights: true, lat: 21.0365, lon: -86.8771},
  {iata: 'PTY', name: 'Aeroporto Internacional de Tocumen', city: 'Cidade do Panamá', stateOrCountry: 'Panamá', region: 'Caribe & América Central', isBrazilian: false, hasInternationalFlights: true, lat: 9.0714, lon: -79.3835},
  {iata: 'PUJ', name: 'Punta Cana International Airport', city: 'Punta Cana', stateOrCountry: 'Rep. Dominicana', region: 'Caribe & América Central', isBrazilian: false, hasInternationalFlights: true, lat: 18.5674, lon: -68.3634},

  // --- Europa ---
  {iata: 'LIS', name: 'Aeroporto Humberto Delgado', city: 'Lisboa', stateOrCountry: 'Portugal', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 38.7813, lon: -9.1359},
  {iata: 'OPO', name: 'Aeroporto Francisco Sá Carneiro', city: 'Porto', stateOrCountry: 'Portugal', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 41.2481, lon: -8.6814},
  {iata: 'MAD', name: 'Aeroporto Adolfo Suárez Madrid-Barajas', city: 'Madri', stateOrCountry: 'Espanha', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 40.4983, lon: -3.5676},
  {iata: 'BCN', name: 'Aeroporto Josep Tarradellas Barcelona-El Prat', city: 'Barcelona', stateOrCountry: 'Espanha', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 41.2974, lon: 2.0833},
  {iata: 'CDG', name: 'Aeroporto Paris-Charles de Gaulle', city: 'Paris', stateOrCountry: 'França', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 49.0097, lon: 2.5479},
  {iata: 'ORY', name: 'Aeroporto Paris-Orly', city: 'Paris (Orly)', stateOrCountry: 'França', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 48.7262, lon: 2.3652},
  {iata: 'LHR', name: 'London Heathrow Airport', city: 'Londres', stateOrCountry: 'Reino Unido', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 51.4700, lon: -0.4543},
  {iata: 'FCO', name: 'Aeroporto Leonardo da Vinci (Fiumicino)', city: 'Roma', stateOrCountry: 'Itália', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 41.8003, lon: 12.2389},
  {iata: 'MXP', name: 'Aeroporto Milano-Malpensa', city: 'Milão', stateOrCountry: 'Itália', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 45.6301, lon: 8.7255},
  {iata: 'FRA', name: 'Frankfurt am Main Airport', city: 'Frankfurt', stateOrCountry: 'Alemanha', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 50.0379, lon: 8.5622},
  {iata: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdã', stateOrCountry: 'Holanda', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 52.3105, lon: 4.7683},
  {iata: 'ZRH', name: 'Zürich Airport', city: 'Zurique', stateOrCountry: 'Suíça', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 47.4647, lon: 8.5492},

  // --- Oriente Médio, África & Ásia ---
  {iata: 'DXB', name: 'Dubai International Airport', city: 'Dubai', stateOrCountry: 'Emirados Árabes', region: 'Oriente Médio & Ásia', isBrazilian: false, hasInternationalFlights: true, lat: 25.2532, lon: 55.3657},
  {iata: 'DOH', name: 'Hamad International Airport', city: 'Doha', stateOrCountry: 'Catar', region: 'Oriente Médio & Ásia', isBrazilian: false, hasInternationalFlights: true, lat: 25.2731, lon: 51.6081},
  {iata: 'IST', name: 'Istanbul Airport', city: 'Istambul', stateOrCountry: 'Turquia', region: 'Europa', isBrazilian: false, hasInternationalFlights: true, lat: 41.2753, lon: 28.7519},
  {iata: 'JNB', name: 'O. R. Tambo International Airport', city: 'Joanesburgo', stateOrCountry: 'África do Sul', region: 'África', isBrazilian: false, hasInternationalFlights: true, lat: -26.1367, lon: 28.2411},
  {iata: 'LAD', name: 'Aeroporto Internacional Quatro de Fevereiro', city: 'Luanda', stateOrCountry: 'Angola', region: 'África', isBrazilian: false, hasInternationalFlights: true, lat: -8.8584, lon: 13.2312},
  {iata: 'NRT', name: 'Narita International Airport', city: 'Tóquio', stateOrCountry: 'Japão', region: 'Oriente Médio & Ásia', isBrazilian: false, hasInternationalFlights: true, lat: 35.7720, lon: 140.3929},
];

export const ALL_AIRPORTS: Airport[] = [...BRAZILIAN_AIRPORTS, ...INTERNATIONAL_DESTINATIONS];
