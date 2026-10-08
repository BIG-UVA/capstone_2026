library(tximport)
library(ggplot2)
library(DESeq2)


base_dir    <- "/standard/harrislab/capstone_2026"
project_dir <- path.expand("~/MSDS/capstone_project")

metadata_results_dir <- file.path(project_dir, "results", "metadata")
counts_dir  <- file.path(project_dir, "results", "counts")
tpm_dir     <- file.path(project_dir, "results", "tpm")
results_dir <- file.path(project_dir, "results")
figures_dir <- file.path(project_dir, "figures")

tx2gene <- read.csv(file.path(base_dir, "reference", "Mus_musculus.GRCm39.transcript2gene.csv"))
tx2gene <- tx2gene[, c("transcript_id", "gene_id")]
tx2gene$transcript_id <- gsub("\\..*", "", tx2gene$transcript_id)
tx2gene$gene_id       <- gsub("\\..*", "", tx2gene$gene_id)


# Metadata + file list come from the master sample table (notebook 01)
master <- read.csv(file.path(metadata_results_dir, "master_sample_table.csv"),
                   stringsAsFactors = FALSE)

all_files <- setNames(master$quant_path, master$sample)
cat("Total samples:", length(all_files), "\n")
stopifnot(all(file.exists(all_files)))

metadata <- master
rownames(metadata) <- metadata$sample
cat("\nAll samples:\n")
print(metadata)


txi <- tximport(
  all_files,
  type = "salmon",
  tx2gene = tx2gene,
  countsFromAbundance = "no",
  ignoreTxVersion = TRUE,
  dropInfReps = TRUE
)

cat("\nImported:", nrow(txi$counts), "genes x", ncol(txi$counts), "samples\n")

# Save canonical tximport outputs for downstream steps (DE, pathway)
saveRDS(txi, file.path(results_dir, "txi_all_samples.rds"))
write.csv(txi$counts,    file.path(counts_dir, "gene_counts_all_samples.csv"))
write.csv(txi$abundance, file.path(tpm_dir, "gene_tpm_all_samples.csv"))

dds <- DESeqDataSetFromTximport(txi, colData = metadata, design = ~ 1)  # no design needed for PCA

keep <- rowSums(counts(dds) >= 10) >= 3
dds  <- dds[keep, ]
cat("Genes after filtering:", nrow(dds), "\n")

vsd <- vst(dds, blind = TRUE)

pca_data <- plotPCA(vsd, intgroup = c("dataset"), returnData = TRUE)
percent_var <- round(100 * attr(pca_data, "percentVar"))

p1 <- ggplot(pca_data, aes(x = PC1, y = PC2, color = dataset)) +
  geom_point(size = 3, alpha = 0.8) +
  xlab(paste0("PC1 (", percent_var[1], "% variance)")) +
  ylab(paste0("PC2 (", percent_var[2], "% variance)")) +
  ggtitle("PCA — All Datasets (colored by study)") +
  theme_minimal(base_size = 13) +
  theme(legend.position = "bottom")

pca_data2 <- plotPCA(vsd, intgroup = c("condition", "dataset"),returnData= TRUE)

p2 <- ggplot(pca_data2, aes(x = PC1, y = PC2, color = condition, shape = dataset)) +
  geom_point(size = 3, alpha = 0.8) +
  xlab(paste0("PC1 (", percent_var[1], "% variance)")) +
  ylab(paste0("PC2 (", percent_var[2], "% variance)")) +
  ggtitle("PCA — All Datasets (colored by condition)") +
  theme_minimal(base_size = 13) +
  theme(legend.position = "bottom")

pca_data3 <- plotPCA(vsd, intgroup = c("genotype", "dataset"),returnData =TRUE)

p3 <- ggplot(pca_data3, aes(x= PC1,y =PC2,color =genotype,shape = dataset)) +
  geom_point(size = 3, alpha = 0.8) +
  xlab(paste0("PC1 (", percent_var[1], "% variance)")) +
  ylab(paste0("PC2 (", percent_var[2], "% variance)")) +
  ggtitle("PCA — All Datasets (colored by genotype)") +
  theme_minimal(base_size = 13) +
  theme(legend.position = "bottom")

options(bitmapType = "cairo")
ggsave(file.path(figures_dir, "pca_all_by_dataset.png"), p1, width = 10, height = 7)
ggsave(file.path(figures_dir, "pca_all_by_condition.png"), p2, width = 10, height = 7)
ggsave(file.path(figures_dir, "pca_all_by_genotype.png"), p3, width = 10, height = 7)

cat("\nPlots saved to:", figures_dir, "\n")
