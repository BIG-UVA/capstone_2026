library(readxl)
library(dplyr)
library(stringr)

standard_cols <- c(
  "dataset", "sample", "quant_path", "file_exists", "title", "organism",
  "cell_type", "condition", "genotype", "genotype_short",
  "comparison_group", "strain", "sex", "timepoint", "treatment",
  "disease_model", "syk_status", "dataset_description",
  "processed_file", "raw_file_1", "raw_file_2",
  "geo_sample", "biosample", "experiment"
)

standardize_cols <- function(df) {
  missing_cols <- setdiff(standard_cols, names(df))
  for (col in missing_cols) df[[col]] <- NA
  df[, standard_cols]
}

read_geo_sample_section <- function(file, sheet, sample_header_options = c("Sample name", "library name")) {
  raw <- read_excel(file, sheet = sheet, col_names = FALSE)

  header_row <- which(apply(raw, 1, function(row) {
    any(as.character(row) %in% sample_header_options, na.rm = TRUE)
  }))[1]

  if (is.na(header_row)) {
    stop(paste("Could not find sample header in", file))
  }

  table <- read_excel(file, sheet = sheet, skip = header_row - 1)

  first_col <- names(table)[1]

  table <- table %>%
    filter(!is.na(.data[[first_col]])) %>%
    filter(.data[[first_col]] != "PROTOCOLS")

  return(table)
}

read_gse146680_metadata <- function(base_dir) {
  file <- file.path(base_dir, "metadata", "GSE146680", "harris_GEO_spreadsheet.xls")
  raw <- read_geo_sample_section(file, "Experiment Sheet")

  df <- data.frame(
    dataset = "GSE146680",
    sample = raw[["Sample name"]],
    title = raw[["title"]],
    organism = raw[["organism"]],
    cell_type = raw[["characteristics: cell type"]],
    condition = "T_gondii_infected",
    genotype = "Control",
    genotype_short = "Control",
    comparison_group = raw[["characteristics: cell type"]],
    strain = raw[["characteristics: strain"]],
    disease_model = "T_gondii",
    dataset_description = "T. gondii-infected microglia versus macrophages",
    processed_file = raw[["processed data file"]],
    raw_file_1 = raw[["raw file 1"]],
    raw_file_2 = raw[["raw file 2"]],
    stringsAsFactors = FALSE
  )

  standardize_cols(df)
}

read_gse203655_metadata <- function(base_dir) {
  file <- file.path(base_dir, "metadata", "GSE203655", "metadata_wt_vs_stat1_ko.xlsx")
  raw <- read_geo_sample_section(file, "2. Metadata Template")

  raw <- raw %>%
    filter(`library name` %in% c("R1", "R2", "R3", "R4", "R5", "T1", "T3", "T4"))

  inferred_genotype <- ifelse(
    str_detect(raw[["title"]], regex("STAT1-KO|STAT1 KO", ignore_case = TRUE)),
    "STAT1_KO",
    "WT"
  )

  df <- data.frame(
    dataset = "GSE203655",
    sample = raw[["library name"]],
    title = raw[["title"]],
    organism = raw[["organism"]],
    cell_type = raw[["cell type"]],
    condition = "T_gondii_infected",
    genotype = inferred_genotype,
    genotype_short = inferred_genotype,
    comparison_group = ifelse(inferred_genotype == "STAT1_KO", "Knockout", "Control"),
    strain = raw[["genotype"]],
    sex = raw[["sex"]],
    treatment = raw[["treatment"]],
    timepoint = raw[["time"]],
    disease_model = "T_gondii",
    syk_status = NA,
    dataset_description = "T. gondii-infected WT versus STAT1-KO microglia",
    processed_file = raw[[13]],
    raw_file_1 = raw[[15]],
    raw_file_2 = raw[[16]],
    stringsAsFactors = FALSE
  )

  standardize_cols(df)
}

read_gse212277_metadata <- function(base_dir) {
  file <- file.path(base_dir, "metadata", "GSE212277", "sra_accession.xlsx")
  raw <- read_excel(file, sheet = "Sheet1")

  genotype_short <- case_when(
    raw[["genotype"]] == "WT (Control)" ~ "WT",
    raw[["genotype"]] == "5xFAD" ~ "5xFAD",
    str_detect(raw[["genotype"]], "5xFAD") & str_detect(raw[["genotype"]], "Syk") ~ "5xFAD_Syk_altered",
    str_detect(raw[["genotype"]], "Syk") ~ "Syk_altered",
    TRUE ~ raw[["genotype"]]
  )

  df <- data.frame(
    dataset = "GSE212277",
    sample = raw[["Run"]],
    title = raw[["Sample Name"]],
    organism = "Mus musculus",
    cell_type = "Microglia",
    condition = ifelse(str_detect(raw[["genotype"]], "5xFAD"), "Alzheimers_model", "Control"),
    genotype = raw[["genotype"]],
    genotype_short = genotype_short,
    comparison_group = case_when(
      genotype_short == "WT" ~ "Control",
      genotype_short == "5xFAD" ~ "Disease",
      genotype_short == "Syk_altered" ~ "Syk_altered",
      genotype_short == "5xFAD_Syk_altered" ~ "Disease_Syk_altered",
      TRUE ~ NA_character_
    ),
    disease_model = ifelse(str_detect(raw[["genotype"]], "5xFAD"), "5xFAD", "Control"),
    syk_status = ifelse(str_detect(raw[["genotype"]], "Syk"), "Syk_altered", "Syk_WT"),
    dataset_description = "5xFAD Alzheimer model with Syk genotype comparison",
    biosample = raw[["BioSample"]],
    experiment = raw[["Experiment"]],
    geo_sample = raw[["Library Name"]],
    stringsAsFactors = FALSE
  )

  standardize_cols(df)
}

#---------------------------------------------------------------------------------
# Function: build_master_sample_table()
#
# Purpose:
# Combines standardized study metadata with the sample inventory.
#
# Important:
# quant_path and file_exists are generated from the Rivanna directory
# inventory. The metadata import functions contain empty placeholder versions
# of these fields only to satisfy the common schema. Those placeholders must be
# removed before joining, or dplyr will create .x and .y duplicate columns.
#
# Adding a new dataset:
# Add its standardized reader to bind_rows() below. Downstream analysis code
# should continue using the same Master Sample Table structure.
# --------------------------------------------------------------------------------

build_master_sample_table <- function(base_dir, sample_inventory) {

  meta <- bind_rows(
    read_gse146680_metadata(base_dir),
    read_gse203655_metadata(base_dir),
    read_gse212277_metadata(base_dir)
  )

  # Keep the valid file-location fields from sample_inventory.
  # Remove the empty standardized placeholders from metadata before joining.
  meta <- meta %>%
    select(-any_of(c("quant_path", "file_exists")))

  master <- sample_inventory %>%
    left_join(
      meta,
      by = c("dataset", "sample")
    ) %>%
    standardize_cols()

  return(master)
}
